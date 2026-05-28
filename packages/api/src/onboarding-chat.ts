import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  isTextUIPart,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { z } from "zod/v4";

import type { db as databaseClient } from "@acme/db/client";

import type { BuildCurriculumInput } from "./domain/training/agents/onboarding-chat-agent";
import type { CurriculumPlan } from "./domain/training/types/training.types";
import {
  createBuildCurriculumTool,
  normalizeLearningTrackName,
  ONBOARDING_CHAT_SYSTEM,
} from "./domain/training/agents/onboarding-chat-agent";
import {
  getAiModelForPurpose,
  getMissingAiKeyMessage,
  getSearchToolsForSelectedProvider,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import { buildCurriculumNodes } from "./domain/training/orchestration/curriculum-flow";
import { trainingCurriculumRepository } from "./repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";

type Database = typeof databaseClient;

type BuildCurriculumOutcome =
  | { success: true; plan: CurriculumPlan }
  | { success: false; error: string };

const extractText = (message: UIMessage): string =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n")
    .trim();

const createNameLearningTrackTool = () =>
  tool({
    description:
      "Create the saved learning track name from the learner's topic. Return only the topic in lowercase kebab-case, not an identity phrase or descriptive title.",
    inputSchema: z.object({
      topic: z
        .string()
        .min(1)
        .describe(
          'The core topic the learner is studying, such as "computer engineering" or "machine learning".',
        ),
    }),
    execute: ({ topic }): { name: string } => ({
      name: normalizeLearningTrackName(topic),
    }),
  });

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
    streamOnboardingChatWithModelPreference({
      db,
      sessionId,
      userId,
      messages,
    }),
  );

const streamOnboardingChatWithModelPreference = async ({
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

  const persistedMessages = await trainingOnboardingRepository.listMessages({
    db,
    sessionId,
  });
  const userAnswerCount = persistedMessages.filter(
    (message) => message.role === "user",
  ).length;

  const buildCurriculumFromDesigner = async (
    input: BuildCurriculumInput,
  ): Promise<BuildCurriculumOutcome> => {
    const existingPlan = await trainingCurriculumRepository.getActivePlan({
      db,
      sessionId,
    });
    if (existingPlan) {
      return { success: true, plan: existingPlan };
    }
    if (userAnswerCount < 4) {
      return {
        success: false,
        error: "The learner has not answered enough onboarding questions yet.",
      };
    }

    const createdProfile =
      await trainingOnboardingRepository.createProfileVersion({
        db,
        sessionId,
        userId: session.userId,
        report: input.identityReport,
        beforeAfter: input.beforeAfter,
      });

    if (!createdProfile) {
      return { success: false, error: "Failed to build identity profile." };
    }

    const plan = await trainingCurriculumRepository.createPlan({
      db,
      onboardingSessionId: sessionId,
      profileVersionId: createdProfile.version.id,
      userId: session.userId,
      blueprint: {
        title: normalizeLearningTrackName(input.learningTrackName),
        summary: input.planDraft.summary,
        targetIdentity: input.planDraft.targetIdentity,
        overview: input.overview
          ? {
              ...input.overview,
              generatedAt: new Date().toISOString(),
            }
          : null,
        beforeAfter: input.beforeAfter,
        nodes: buildCurriculumNodes(
          input.planDraft,
          input.identityReport.targetIdentity,
          input.identityReport.headline,
        ),
      },
    });

    if (!plan) {
      return { success: false, error: "Failed to create curriculum plan." };
    }

    await trainingOnboardingRepository.updateSession({
      db,
      sessionId,
      status: "complete",
    });

    const createdPlan = await trainingCurriculumRepository.getActivePlan({
      db,
      sessionId,
    });

    return createdPlan
      ? { success: true, plan: createdPlan }
      : { success: false, error: "Curriculum plan was not found." };
  };

  const buildCurriculumTool = createBuildCurriculumTool({
    buildCurriculum: buildCurriculumFromDesigner,
  });
  const nameLearningTrackTool = createNameLearningTrackTool();

  const modelMessages = await convertToModelMessages(messages);
  const runtimeInstruction =
    userAnswerCount >= 4
      ? "\n\nRuntime state: The learner has answered four times. In this response, call nameLearningTrack to produce the topic-only saved track name, then call buildCurriculum with learningTrackName set to that exact name."
      : "\n\nRuntime state: Keep interviewing. Do not call buildCurriculum until the learner has answered at least four times.";
  const stream = streamText({
    model,
    system: `${ONBOARDING_CHAT_SYSTEM}${runtimeInstruction}`,
    messages: modelMessages,
    tools: {
      ...getSearchToolsForSelectedProvider(),
      nameLearningTrack: nameLearningTrackTool,
      buildCurriculum: buildCurriculumTool,
    },
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

  return stream.toUIMessageStreamResponse();
};
