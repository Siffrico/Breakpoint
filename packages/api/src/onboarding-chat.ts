import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isTextUIPart,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";

import type { db as databaseClient } from "@acme/db/client";

import type { CreateProjectResult } from "./domain/training/agents/onboarding-chat-agent";
import type {
  CreateProjectInput,
  ProjectBuildState,
} from "./domain/training/orchestration/build-project";
import {
  createCreateProjectTool,
  ONBOARDING_CHAT_SYSTEM,
} from "./domain/training/agents/onboarding-chat-agent";
import {
  getAiModelForPurpose,
  getMissingAiKeyMessage,
  getSearchToolsForSelectedProvider,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import {
  buildProjectFromOnboarding,
  getProjectBuildReadiness,
} from "./domain/training/orchestration/build-project";
import { buildProjectCheckpointRepository } from "./repositories/build-project-checkpoint-repository";
import { createBuildProjectDeps } from "./repositories/build-project-repository-deps";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";

type Database = typeof databaseClient;

// Re-exported for the client so the build card can type the streamed data part
// without importing this server module's runtime. (Type-only imports are erased.)
export type {
  ProjectBuildState,
  ProjectBuildStep,
  ProjectBuildStepState,
  ProjectBuildStepStatus,
  ProjectBuildPhase,
} from "./domain/training/orchestration/build-project";
export type { CreateProjectResult } from "./domain/training/agents/onboarding-chat-agent";

/** Stable id of the single keyed progress data part the build streams through. */
export const PROJECT_BUILD_DATA_ID = "project-build";

interface ProjectBuildData extends Record<string, unknown> {
  "project-build": ProjectBuildState;
}

export type OnboardingChatUIMessage = UIMessage<unknown, ProjectBuildData>;

const extractText = (message: UIMessage): string =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n")
    .trim();

export const streamOnboardingChat = async ({
  db,
  sessionId,
  userId,
  messages,
  modelName,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  messages: UIMessage[];
  modelName?: string | null;
}): Promise<Response> =>
  withAiModelPreference(modelName, () =>
    runOnboardingChat({ db, sessionId, userId, messages }),
  );

/**
 * Resumes a previously-started project build over the *same* streamed channel
 * the live build uses, re-emitting the keyed `data-project-build` part so the
 * build card reconciles in place. No LLM turn runs — this only replays the
 * deterministic build (the checkpoint registry short-circuits already-built
 * artifacts), so a retry or an overview-gap regen ticks step-by-step on the
 * card instead of going silent behind a tRPC mutation.
 */
export const streamProjectBuildResume = async ({
  db,
  sessionId,
  userId,
  modelName,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  modelName?: string | null;
}): Promise<Response> => {
  const session = await trainingOnboardingRepository.getSession({
    db,
    sessionId,
  });
  if (!session) {
    return new Response("Onboarding session not found.", { status: 404 });
  }
  if (session.userId !== userId) {
    return new Response("Forbidden.", { status: 403 });
  }

  const run = await buildProjectCheckpointRepository.getRun({ db, sessionId });
  if (!run) {
    return new Response("No project build is available to resume.", {
      status: 404,
    });
  }

  const transcript = await trainingOnboardingRepository.listMessages({
    db,
    sessionId,
  });

  // Honor the learner's model preference for the agents the build runs.
  return withAiModelPreference(modelName, () => {
    const stream = createUIMessageStream<OnboardingChatUIMessage>({
      onError: () => "The project build hit an error.",
      execute: async ({ writer }) => {
        await buildProjectFromOnboarding({
          sessionId,
          userId: session.userId,
          transcript,
          input: run.input,
          deps: createBuildProjectDeps(db),
          onProgress: (build) => {
            writer.write({
              type: "data-project-build",
              id: PROJECT_BUILD_DATA_ID,
              data: build,
            });
          },
        });
      },
    });

    return Promise.resolve(createUIMessageStreamResponse({ stream }));
  });
};

const runOnboardingChat = async ({
  db,
  sessionId,
  userId,
  messages,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  messages: UIMessage[];
}): Promise<Response> => {
  const session = await trainingOnboardingRepository.getSession({
    db,
    sessionId,
  });
  if (!session) {
    return new Response("Onboarding session not found.", { status: 404 });
  }
  if (session.userId !== userId) {
    return new Response("Forbidden.", { status: 403 });
  }

  // Persist the learner's latest answer. On an approval-resumed turn the last
  // message is the assistant's (carrying the approval response), so we skip it.
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    const text = extractText(last);
    if (text.length > 0) {
      await trainingOnboardingRepository.appendMessage({
        db,
        sessionId,
        role: "user",
        content: text,
        slot: "chat",
      });
    }
  }

  const model = getAiModelForPurpose("onboarding");
  if (!model) {
    return new Response(getMissingAiKeyMessage("onboarding chat"), {
      status: 500,
    });
  }

  const transcript = await trainingOnboardingRepository.listMessages({
    db,
    sessionId,
  });
  const projectBuildReadiness = getProjectBuildReadiness(transcript);
  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream<OnboardingChatUIMessage>({
    onError: () => "The onboarding chat hit an error.",
    execute: ({ writer }) => {
      // Runs the full project build, streaming each step to the build card and
      // persisting atomically. Only invoked after the learner approves.
      const buildProject = async (
        input: CreateProjectInput,
      ): Promise<CreateProjectResult> => {
        const result = await buildProjectFromOnboarding({
          sessionId,
          userId: session.userId,
          transcript,
          input,
          deps: createBuildProjectDeps(db),
          onProgress: (build) => {
            writer.write({
              type: "data-project-build",
              id: PROJECT_BUILD_DATA_ID,
              data: build,
            });
          },
        });

        return result.success
          ? {
              ok: true,
              sessionId: result.data.sessionId,
              planId: result.data.planId,
              title: result.data.title,
              moduleCount: result.data.moduleCount,
              firstUnitId: result.data.firstUnitId,
            }
          : { ok: false, reason: result.error };
      };

      const result = streamText({
        model,
        system: `${ONBOARDING_CHAT_SYSTEM}

Runtime state: ${
          projectBuildReadiness.ready
            ? "The server has enough learner signal to request project confirmation, but only call createProject if the learner has explicitly chosen one of your suggested projects."
            : "Do not call createProject yet. Keep consulting with one short question; the server does not have enough concrete learner signal to create a project."
        }`,
        messages: modelMessages,
        tools: {
          ...getSearchToolsForSelectedProvider("onboarding"),
          createProject: createCreateProjectTool({
            buildProject,
            getReadiness: () => projectBuildReadiness,
          }),
        },
        // SDK-native server-side smoothing: release whole words on a short
        // cadence so the client renders a steady stream.
        experimental_transform: smoothStream({
          delayInMs: 15,
          chunking: "word",
        }),
        stopWhen: stepCountIs(5),
        onFinish: async ({ text }) => {
          const trimmed = text.trim();
          if (trimmed.length === 0) return;
          await trainingOnboardingRepository.appendMessage({
            db,
            sessionId,
            role: "assistant",
            content: trimmed,
            slot: "chat",
          });
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
};
