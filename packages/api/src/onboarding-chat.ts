import {
  convertToModelMessages,
  isTextUIPart,
  streamText,
  type UIMessage,
} from "ai";

import type { db as databaseClient } from "@acme/db/client";

import {
  ONBOARDING_CHAT_SYSTEM,
  createBuildCurriculumTool,
} from "./domain/becoming/agents/onboarding-chat-agent";
import { getModelForTier } from "./domain/becoming/engine/model-router";
import { generateCurriculumWorkflow } from "./domain/becoming/workflows/generate-curriculum-workflow";
import { becomingCurriculumRepository } from "./repositories/becoming-curriculum-repository";
import { becomingOnboardingRepository } from "./repositories/becoming-onboarding-repository";

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
  const session = await becomingOnboardingRepository.getSession({
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
      await becomingOnboardingRepository.appendMessage({
        db,
        sessionId,
        role: "user",
        content: text,
        slot: "chat",
      });
    }
  }

  const model = getModelForTier("standard");
  if (!model) {
    return new Response("OPENAI_API_KEY is required for onboarding chat.", {
      status: 500,
    });
  }

  const buildCurriculumTool = createBuildCurriculumTool({
    buildCurriculum: async () => {
      const result = await generateCurriculumWorkflow({
        sessionId,
        deps: {
          getSession: (id) =>
            becomingOnboardingRepository.getSession({ db, sessionId: id }),
          listMessages: (id) =>
            becomingOnboardingRepository.listMessages({ db, sessionId: id }),
          createProfileVersion: (input) =>
            becomingOnboardingRepository.createProfileVersion({ db, ...input }),
          createPlan: (input) =>
            becomingCurriculumRepository.createPlan({ db, ...input }),
          getActivePlan: (id) =>
            becomingCurriculumRepository.getActivePlan({ db, sessionId: id }),
          updateSession: (input) =>
            becomingOnboardingRepository.updateSession({ db, ...input }),
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
      await becomingOnboardingRepository.appendMessage({
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
