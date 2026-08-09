import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  hasToolCall,
  isTextUIPart,
  isToolUIPart,
  safeValidateUIMessages,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";

import type { db as databaseClient } from "@acme/db/client";
import type { StartingPointTier } from "@acme/validators";
import { CurriculumModeSchema } from "@acme/validators";

import type { CreateProjectResult } from "./domain/training/agents/onboarding-chat-agent";
import type {
  CreateProjectInput,
  ProjectBuildState,
} from "./domain/training/orchestration/build-project";
import {
  AskStartingPointOutputSchema,
  askStartingPointTool,
  createCreateProjectTool,
  ONBOARDING_CHAT_SYSTEM,
} from "./domain/training/agents/onboarding-chat-agent";
import {
  createCreateTopicProjectTool,
  TOPIC_ONBOARDING_CHAT_SYSTEM,
} from "./domain/training/agents/topic-onboarding-chat-agent";
import {
  getAiModelForPurpose,
  getMissingAiKeyMessage,
  getSearchToolsForSelectedProvider,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import { buildProjectFromOnboarding } from "./domain/training/orchestration/build-project";
import { buildProjectCheckpointRepository } from "./repositories/build-project-checkpoint-repository";
import { createBuildProjectDeps } from "./repositories/build-project-repository-deps";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";

type Database = typeof databaseClient;

// Re-exported for the client so the build card can type the streamed data part
// without importing this server module's runtime. (Type-only imports are erased.)
export type {
  ProjectBuildArtifactStep,
  ProjectBuildPhase,
  ProjectBuildState,
  ProjectBuildStep,
  ProjectBuildStepDetail,
  ProjectBuildStepState,
  ProjectBuildStepStatus,
} from "./domain/training/orchestration/build-project";
export type { CreateProjectResult } from "./domain/training/agents/onboarding-chat-agent";

/** Stable id of the single keyed progress data part the build streams through. */
export const PROJECT_BUILD_DATA_ID = "project-build";
const PROJECT_PROPOSAL_TURN_ID = "onboarding-project-proposal";
const PROJECT_BUILD_STATUS_TURN_ID = "onboarding-project-build-status";

interface ProjectBuildData extends Record<string, unknown> {
  "project-build": ProjectBuildState;
}

export type OnboardingChatUIMessage = UIMessage<unknown, ProjectBuildData>;

const MAX_ONBOARDING_MESSAGE_CHARS = 4_000;
const MAX_ONBOARDING_HISTORY_CHARS = 32_000;

const extractText = (message: UIMessage): string =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n")
    .trim();

const isPendingToolPart = (part: UIMessage["parts"][number]): boolean =>
  isToolUIPart(part) &&
  (part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested");

export const omitPendingOnboardingToolCalls = <MESSAGE extends UIMessage>(
  messages: MESSAGE[],
): MESSAGE[] =>
  messages.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => !isPendingToolPart(part)),
  }));

const transcriptToModelMessages = async (
  transcript: Awaited<
    ReturnType<typeof trainingOnboardingRepository.listMessages>
  >,
) =>
  convertToModelMessages(
    transcript.map((message) => ({
      id: `persisted-${message.sequence}`,
      role: message.role,
      parts: [{ type: "text" as const, text: message.content }],
    })),
  );

const getToolInteractionMessages = (messages: UIMessage[]): UIMessage[] =>
  omitPendingOnboardingToolCalls(messages)
    .map((message) => ({
      ...message,
      parts: message.parts.filter(isToolUIPart),
    }))
    .filter((message) => message.parts.length > 0);

export const validateOnboardingMessages = async (messages: unknown) => {
  const result = await safeValidateUIMessages<OnboardingChatUIMessage>({
    messages,
  });
  if (!result.success) return result;

  let totalChars = 0;
  for (const message of result.data) {
    if (message.role === "system") {
      return {
        success: false as const,
        error: new Error("System messages are not allowed."),
      };
    }

    const text = extractText(message);
    totalChars += text.length;
    if (
      text.length > MAX_ONBOARDING_MESSAGE_CHARS ||
      totalChars > MAX_ONBOARDING_HISTORY_CHARS
    ) {
      return {
        success: false as const,
        error: new Error("Onboarding message history is too large."),
      };
    }
  }

  return result;
};

/**
 * The newest answered `askStartingPoint` tool part across the transcript, if
 * any. Rebuilt transcripts (transcriptToMessages) drop tool parts after a
 * reload, so the model would otherwise forget the tap — we read it back here to
 * persist and re-inject it. Scans newest-first so the latest answer wins.
 */
const findLatestStartingPointAnswer = (
  messages: UIMessage[],
): { tier: StartingPointTier; label: string } | null => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const parts = messages[i]?.parts ?? [];
    for (let j = parts.length - 1; j >= 0; j -= 1) {
      const part = parts[j];
      if (
        part &&
        part.type === "tool-askStartingPoint" &&
        "output" in part &&
        part.output !== undefined
      ) {
        const parsed = AskStartingPointOutputSchema.safeParse(part.output);
        if (parsed.success) return parsed.data;
      }
    }
  }
  return null;
};

export const streamOnboardingChat = async ({
  db,
  sessionId,
  userId,
  messages,
  modelName,
  scheduleBackgroundTask,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  messages: unknown;
  modelName?: string | null;
  /** Next.js `after` seam so post-build prewarm survives the response. */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}): Promise<Response> =>
  withAiModelPreference(modelName, () =>
    validateOnboardingMessages(messages).then((validatedMessages) => {
      if (!validatedMessages.success) {
        return new Response("Invalid onboarding conversation.", {
          status: 400,
        });
      }

      return runOnboardingChat({
        db,
        sessionId,
        userId,
        messages: validatedMessages.data,
        scheduleBackgroundTask,
      });
    }),
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
  scheduleBackgroundTask,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  modelName?: string | null;
  /** Next.js `after` seam so post-build prewarm survives the response. */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
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
        try {
          await buildProjectFromOnboarding({
            sessionId,
            userId: session.userId,
            transcript,
            input: run.input,
            deps: createBuildProjectDeps(db),
            scheduleBackgroundTask,
            // Carried forward so a build that keeps yielding eventually stops.
            resumeRound: run.state.resumeRounds ?? 0,
            onProgress: (build) => {
              writer.write({
                type: "data-project-build",
                id: PROJECT_BUILD_DATA_ID,
                data: build,
              });
            },
          });
        } catch (cause) {
          const error =
            cause instanceof Error
              ? cause.message
              : "The project build stopped before completion.";
          const failed = await buildProjectCheckpointRepository.failRun({
            db,
            sessionId,
            error,
          });
          if (failed) {
            writer.write({
              type: "data-project-build",
              id: PROJECT_BUILD_DATA_ID,
              data: failed.state,
            });
          }
        }
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
  scheduleBackgroundTask,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  messages: UIMessage[];
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
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

  // Persist the learner's latest answer. On an approval-resumed turn the last
  // message is the assistant's (carrying the approval response), so we skip it.
  // Idempotency guard: a retried request (network error, reload + recovery
  // regenerate) re-sends a message that is already the transcript tail —
  // re-appending it would duplicate rows, inflate the readiness char counts,
  // and pollute the transcript every downstream agent reads.
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    const text = extractText(last);
    const tail = transcript[transcript.length - 1];
    const alreadyPersisted = tail?.role === "user" && tail.content === text;
    if (text.length > 0 && !alreadyPersisted) {
      await trainingOnboardingRepository.appendMessage({
        db,
        sessionId,
        role: "user",
        content: text,
        slot: "chat",
      });
      transcript.push({
        role: "user",
        content: text,
        sequence: (tail?.sequence ?? -1) + 1,
        slot: null,
      });
    }
  }
  const [persistedModelMessages, toolInteractionMessages] = await Promise.all([
    transcriptToModelMessages(transcript),
    convertToModelMessages(getToolInteractionMessages(messages), {
      ignoreIncompleteToolCalls: true,
    }),
  ]);
  const modelMessages = [...persistedModelMessages, ...toolInteractionMessages];

  // The learner's tapped starting point rides an execute-less tool result. It
  // initializes the persisted value atomically; later manual overrides remain
  // authoritative when this old tool result is replayed on approval.
  const startingPointAnswer = findLatestStartingPointAnswer(messages);
  if (startingPointAnswer) {
    await trainingOnboardingRepository.setInitialStartingPoint({
      db,
      sessionId,
      tier: startingPointAnswer.tier,
      label: startingPointAnswer.label,
    });
  }
  const storedTier = session.startingPointTier ?? startingPointAnswer?.tier;
  const storedLabel = session.startingPointLabel ?? startingPointAnswer?.label;
  const startingPointNote =
    storedTier && storedLabel
      ? `Learner starting point: ${storedTier} ("${storedLabel}").`
      : "Starting point not yet asked — call askStartingPoint once the field is known, before suggesting projects.";

  const stream = createUIMessageStream<OnboardingChatUIMessage>({
    onError: () => "The onboarding chat hit an error.",
    execute: ({ writer }) => {
      // Runs the full project build, streaming each step to the build card and
      // persisting atomically. Only invoked after the learner approves.
      const buildProject = async (
        input: CreateProjectInput,
      ): Promise<CreateProjectResult> => {
        let result: Awaited<ReturnType<typeof buildProjectFromOnboarding>>;
        try {
          result = await buildProjectFromOnboarding({
            sessionId,
            userId: session.userId,
            transcript,
            input,
            deps: createBuildProjectDeps(db),
            scheduleBackgroundTask,
            onProgress: (build) => {
              writer.write({
                type: "data-project-build",
                id: PROJECT_BUILD_DATA_ID,
                data: build,
              });
            },
          });
        } catch (cause) {
          const error =
            cause instanceof Error
              ? cause.message
              : "The project build stopped before completion.";
          const failed = await buildProjectCheckpointRepository.failRun({
            db,
            sessionId,
            error,
          });
          if (failed) {
            writer.write({
              type: "data-project-build",
              id: PROJECT_BUILD_DATA_ID,
              data: failed.state,
            });
          }
          return { ok: false, reason: error };
        }

        return result.success
          ? {
              ok: true,
              sessionId: result.data.sessionId,
              planId: result.data.planId,
              title: result.data.title,
              moduleCount: result.data.moduleCount,
              firstUnitId: result.data.firstUnitId,
              // A yielded build is still in progress, not finished. Said plainly
              // so a later turn reading this tool result does not tell the
              // learner their project is ready when it is still being built.
              resuming: result.data.status === "building",
            }
          : { ok: false, reason: result.error };
      };

      // The two curriculum modes run different consultants against the same
      // transcript, tools, and build path. The mode was chosen before the first
      // message, so it never changes mid-session.
      const isTopicMode =
        CurriculumModeSchema.safeParse(session.curriculumMode).data === "topic";
      const consultantSystem = isTopicMode
        ? TOPIC_ONBOARDING_CHAT_SYSTEM
        : ONBOARDING_CHAT_SYSTEM;
      const readyNote = isTopicMode
        ? "createProject shows the learner your reading of them and waits for their approval, so only call it once they have confirmed the outcome split you proposed."
        : "createProject shows the learner your reading of them and waits for their approval, so only call it once they have explicitly chosen one of your suggested projects.";

      const result = streamText({
        model,
        system: `${consultantSystem}

Runtime state: ${readyNote}
${startingPointNote}`,
        messages: modelMessages,
        tools: {
          ...getSearchToolsForSelectedProvider("onboarding"),
          askStartingPoint: askStartingPointTool,
          createProject: isTopicMode
            ? createCreateTopicProjectTool({ buildProject })
            : createCreateProjectTool({ buildProject }),
        },
        // SDK-native server-side smoothing: release whole words on a short
        // cadence so the client renders a steady stream.
        experimental_transform: smoothStream({
          delayInMs: 15,
          chunking: "word",
        }),
        stopWhen: [hasToolCall("createProject"), stepCountIs(5)],
        onFinish: async ({ text, steps }) => {
          // Persist the whole assistant turn, including the tool interactions
          // the rebuilt transcript would otherwise lose on reload: the
          // starting-point question and the proposed project both live only in
          // ephemeral tool parts, so a refresh mid-card would erase them from
          // every future model turn and from the build agents' transcript.
          const rows = new Set<string>();
          const proposals: CreateProjectInput[] = [];
          const trimmed = text.trim();
          for (const step of steps) {
            for (const call of step.toolCalls) {
              if (call.toolName === "askStartingPoint") {
                const question = (
                  call.input as { question?: string }
                ).question?.trim();
                if (question) rows.add(question);
              }
              if (call.toolName === "createProject") {
                proposals.push(call.input as CreateProjectInput);
              }
            }
          }
          if (trimmed.length > 0) {
            if (proposals.length > 0) {
              await trainingOnboardingRepository.upsertMessageByTurnRole({
                db,
                sessionId,
                role: "assistant",
                content: trimmed,
                slot: "project_build_status",
                turnId: PROJECT_BUILD_STATUS_TURN_ID,
              });
            } else {
              rows.add(trimmed);
            }
          }
          for (const content of rows) {
            await trainingOnboardingRepository.appendMessage({
              db,
              sessionId,
              role: "assistant",
              content,
              slot: "chat",
            });
          }
          const proposal = proposals.at(-1);
          if (proposal) {
            await trainingOnboardingRepository.upsertMessageByTurnRole({
              db,
              sessionId,
              role: "assistant",
              content: `Proposed project "${proposal.projectName}" (${proposal.targetIdentity}): ${proposal.summary} Waiting for the learner's confirmation.`,
              slot: "project_proposal",
              turnId: PROJECT_PROPOSAL_TURN_ID,
              metadata: { projectProposal: proposal },
            });
          }
        },
      });

      // Detach the model stream from the client connection: without this, a
      // closed tab aborts generation before onFinish, the assistant's reply is
      // never persisted, and the reloaded transcript dangles on the learner's
      // message. Documented SDK pattern for disconnect-safe persistence.
      void result.consumeStream();

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
};
