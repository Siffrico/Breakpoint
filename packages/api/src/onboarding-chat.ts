import type { UIMessage } from "ai";
import { convertToModelMessages, isTextUIPart, streamText } from "ai";

import type { db as databaseClient } from "@acme/db/client";

import {
  createBuildCurriculumTool,
  ONBOARDING_CHAT_SYSTEM,
} from "./domain/training/agents/onboarding-chat-agent";
import {
  getAiModelForPurpose,
  getMissingAiKeyMessage,
} from "./domain/training/engine/model-router";
import { generateCurriculumWorkflow } from "./domain/training/workflows/generate-curriculum-workflow";
import { trainingCurriculumRepository } from "./repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";

type Database = typeof databaseClient;

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

  const buildCurriculumTool = createBuildCurriculumTool({
    buildCurriculum: async () => {
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
    },
  });

  const modelMessages = await convertToModelMessages(messages);
  const stream = streamText({
    model,
    system: ONBOARDING_CHAT_SYSTEM,
    messages: modelMessages,
    tools: { buildCurriculum: buildCurriculumTool },
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
