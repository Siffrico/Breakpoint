import { smoothStream, streamText } from "ai";

import type { db as databaseClient } from "@acme/db/client";

import { requireAiModelForPurpose } from "./domain/training/engine/model-router";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";

type Database = typeof databaseClient;

export type UnitAskIntent = "idk" | "explain" | "freeform";

// How many recent workspace turns to feed the tutor as context. The tutor only
// needs the live scenario and the learner's latest attempts to localize the
// confusion — older history adds tokens without improving the question.
const MAX_CONTEXT_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 1200;

const BASE_SYSTEM_PROMPT = `You are the in-unit help tutor inside a learning workspace. The learner is mid-scenario and has opened a side panel to ask for help. You can see the live scenario prompt and their recent attempts. Be warm, concise, and specific to THIS scenario — never generic. Use plain prose or short lists. Never reveal a full model answer; guide the learner to produce it themselves.`;

const INTENT_DIRECTIVE: Record<UnitAskIntent, string> = {
  idk: `The learner just signaled they're stuck ("/idk"). Do NOT explain the answer. In one or two sentences, name what they are most likely stuck on based on the live scenario, then ask exactly ONE focused question to pinpoint the confusion. Offer 2–3 concrete options to choose from (for example: the goal of the task, the concept being tested, or how to begin). Keep it short and specific.`,
  explain: `The learner asked you to explain the current scenario further ("/explain"). Expand the live scenario one level deeper: clarify what it is really asking and why it matters, surface the key concept in play, and end by pointing at the first decision they should make. Do not give the answer.`,
  freeform: `Answer the learner's question against the live scenario context. Stay tied to what they are working on right now.`,
};

const truncate = (text: string) =>
  text.length > MAX_MESSAGE_CHARS
    ? `${text.slice(0, MAX_MESSAGE_CHARS)}…`
    : text;

const buildTranscriptContext = (
  messages: { role: string; content: string }[],
) => {
  const recent = messages.slice(-MAX_CONTEXT_MESSAGES);
  if (recent.length === 0) {
    return "No prior turns yet — the scenario has just begun.";
  }

  return recent
    .map((message) => {
      const speaker = message.role === "assistant" ? "Scenario" : "Learner";
      return `${speaker}: ${truncate(message.content.trim())}`;
    })
    .join("\n\n");
};

export const streamUnitAsk = async ({
  db,
  sessionId,
  userId,
  intent,
  message,
  unitTitle,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  intent: UnitAskIntent;
  message: string | null;
  unitTitle: string | null;
}): Promise<Response> => {
  const session = await trainingOnboardingRepository.getSession({
    db,
    sessionId,
  });
  if (!session) {
    return new Response("Session not found.", { status: 404 });
  }
  if (session.userId !== userId) {
    return new Response("Forbidden.", { status: 403 });
  }

  const transcript = await trainingOnboardingRepository.listWorkspaceMessages({
    db,
    sessionId,
  });

  const trimmedMessage = message?.trim() ?? "";
  const learnerTurn =
    intent === "freeform"
      ? trimmedMessage
      : intent === "idk"
        ? "I'm stuck on this and I'm not sure what to do."
        : "Can you explain this scenario further?";

  const contextBlock = [
    unitTitle ? `Unit: ${unitTitle}` : null,
    "Recent workspace context:",
    buildTranscriptContext(transcript),
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = streamText({
    model: requireAiModelForPurpose("tutor", "the unit help tutor"),
    system: `${BASE_SYSTEM_PROMPT}\n\n${INTENT_DIRECTIVE[intent]}`,
    prompt: `${contextBlock}\n\n---\n\n${learnerTurn}`,
    experimental_transform: smoothStream({ delayInMs: 15, chunking: "word" }),
  });

  return result.toUIMessageStreamResponse({
    onError: () => "The tutor could not respond. Try again.",
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};
