import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isTextUIPart,
  stepCountIs,
  streamText,
} from "ai";

import type { db as databaseClient } from "@acme/db/client";

import type {
  BuildCurriculumInput,
  BuildCurriculumResult,
} from "./domain/training/agents/onboarding-chat-agent";
import type { CurriculumPlan } from "./domain/training/types/training.types";
import {
  createBuildCurriculumTool,
  createNameLearningTrackTool,
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
import { generateCurriculumWorkflow } from "./domain/training/workflows/generate-curriculum-workflow";
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

const isGenerationConfirmation = (text: string): boolean =>
  /^(ok|okay|yes|yeah|yep|sure|do it|generate it|let'?s do it|go ahead)[.!]*$/i.test(
    text.trim(),
  );

const assistantAskedToGenerate = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("generate your custom path") ||
    normalized.includes("let's generate") ||
    (normalized.includes("curriculum") && normalized.includes("generate"))
  );
};

const createCurriculumReadyResponse = ({
  output,
  assistantText,
}: {
  output: BuildCurriculumResult;
  assistantText: string;
}): Response => {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const textId = "curriculum-ready-text";
      const toolCallId = "build-curriculum-recovery";

      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: assistantText });
      writer.write({ type: "text-end", id: textId });
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: "buildCurriculum",
        input: {
          reasoning:
            "The learner already gave enough onboarding signal and confirmed generation.",
        },
      });
      writer.write({
        type: "tool-output-available",
        toolCallId,
        output,
      });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
};

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
        title: normalizeLearningTrackName(input.planDraft.title),
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

  const generateAndBuildCurriculum =
    async (): Promise<BuildCurriculumOutcome> => {
      const result = await generateCurriculumWorkflow({
        sessionId,
        deps: {
          getSession: (id) =>
            trainingOnboardingRepository.getSession({ db, sessionId: id }),
          listMessages: (id) =>
            trainingOnboardingRepository.listMessages({ db, sessionId: id }),
          createProfileVersion: (input) =>
            trainingOnboardingRepository.createProfileVersion({ db, ...input }),
          createPlan: (input) =>
            trainingCurriculumRepository.createPlan({ db, ...input }),
          getActivePlan: (id) =>
            trainingCurriculumRepository.getActivePlan({ db, sessionId: id }),
          updateSession: (input) =>
            trainingOnboardingRepository.updateSession({ db, ...input }),
        },
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true, plan: result.data };
    };

  const persistedMessages = await trainingOnboardingRepository.listMessages({
    db,
    sessionId,
  });
  const userAnswerCount = persistedMessages.filter(
    (message) => message.role === "user",
  ).length;
  const previousAssistantMessage = [...persistedMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const lastUserText = last?.role === "user" ? extractText(last) : "";

  if (
    userAnswerCount >= 4 &&
    isGenerationConfirmation(lastUserText) &&
    previousAssistantMessage &&
    assistantAskedToGenerate(previousAssistantMessage.content)
  ) {
    const result = await generateAndBuildCurriculum();
    const output: BuildCurriculumResult = result.success
      ? {
          ok: true,
          planId: result.plan.id,
          title: result.plan.title || "learning-track",
          summary: result.plan.summary,
          unitCount: result.plan.nodes.filter(
            (node) => node.kind === "unit" || node.kind === "integration",
          ).length,
          nextUnitId: result.plan.nextUnitId,
        }
      : { ok: false, reason: result.error };
    const assistantText = output.ok
      ? "Your curriculum is ready."
      : "I could not generate the curriculum. Try again in a moment.";

    await trainingOnboardingRepository.appendMessage({
      db,
      sessionId,
      role: "assistant",
      content: assistantText,
      slot: "chat",
    });

    return createCurriculumReadyResponse({ output, assistantText });
  }

  const buildCurriculumTool = createBuildCurriculumTool({
    buildCurriculum: buildCurriculumFromDesigner,
  });
  const nameLearningTrackTool = createNameLearningTrackTool();

  const modelMessages = await convertToModelMessages(messages);
  const stream = streamText({
    model,
    system: ONBOARDING_CHAT_SYSTEM,
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
