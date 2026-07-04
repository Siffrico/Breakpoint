import type { UIMessage } from "ai";
import type { NextRequest } from "next/server";
import { isTextUIPart } from "ai";

import { streamWorkspaceChat } from "@acme/api/workspace-chat";
import { db } from "@acme/db/client";
import { AiModelPreferenceSchema } from "@acme/validators";

import { requireSession } from "~/app/api/_lib/require-session";

export const runtime = "nodejs";

interface WorkspaceChatRequestBody {
  action?: "submit_answer" | "next_scenario" | "adjust_difficulty";
  manualDifficultySignal?: "too_easy" | "too_hard";
  message?: string;
  messages?: UIMessage[];
  model?: string;
  sessionId?: string;
  turnId?: string;
}

const AI_MODEL_COOKIE = "bp-ai-model";
const resolveModelPreference = (req: NextRequest, model?: string) => {
  const parsed = AiModelPreferenceSchema.safeParse(
    model ?? req.cookies.get(AI_MODEL_COOKIE)?.value,
  );

  return parsed.success ? parsed.data : null;
};

const getTextFromMessage = (message: UIMessage) =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("")
    .trim();

const resolveSubmittedMessage = (body: WorkspaceChatRequestBody) => {
  if (typeof body.message === "string") {
    return body.message.trim();
  }

  if (!Array.isArray(body.messages)) {
    return "";
  }

  for (let index = body.messages.length - 1; index >= 0; index -= 1) {
    const message = body.messages[index];
    if (!message) continue;
    if (message.role !== "user") continue;
    const text = getTextFromMessage(message);
    if (text.length > 0) return text;
  }

  return "";
};

export const POST = async (req: NextRequest) => {
  const session = await requireSession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: WorkspaceChatRequestBody;
  try {
    body = (await req.json()) as WorkspaceChatRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { sessionId } = body;
  const action =
    body.action === "next_scenario" || body.action === "adjust_difficulty"
      ? body.action
      : "submit_answer";
  const submittedMessage =
    action === "next_scenario"
      ? "Next scenario"
      : action === "adjust_difficulty"
        ? `Difficulty adjustment: ${body.manualDifficultySignal ?? "unknown"}`
        : resolveSubmittedMessage(body);
  if (
    !sessionId ||
    typeof sessionId !== "string" ||
    (action === "submit_answer" && submittedMessage.length === 0) ||
    (action === "adjust_difficulty" &&
      body.manualDifficultySignal !== "too_easy" &&
      body.manualDifficultySignal !== "too_hard")
  ) {
    return new Response("Invalid request body", { status: 400 });
  }

  return streamWorkspaceChat({
    db,
    sessionId,
    userId: session.user.id,
    message: submittedMessage,
    action,
    turnId:
      typeof body.turnId === "string" && body.turnId.length > 0
        ? body.turnId.slice(0, 96)
        : null,
    manualDifficultySignal: body.manualDifficultySignal ?? null,
    modelName: resolveModelPreference(req, body.model),
    signal: req.signal,
  });
};
