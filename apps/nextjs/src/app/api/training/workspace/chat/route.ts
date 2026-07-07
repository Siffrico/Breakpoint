import type { UIMessage } from "ai";
import type { NextRequest } from "next/server";
import { isTextUIPart } from "ai";

import { streamWorkspaceChat } from "@acme/api/workspace-chat";
import { db } from "@acme/db/client";
import { AiModelPreferenceSchema } from "@acme/validators";

import { requireSession } from "~/app/api/_lib/require-session";

export const runtime = "nodejs";

interface WorkspaceChatRequestBody {
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
  const [session, bodyResult] = await Promise.all([
    requireSession(req),
    req
      .json()
      .then((body: unknown) => ({ success: true as const, body }))
      .catch(() => ({ success: false as const })),
  ]);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!bodyResult.success) {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (
    bodyResult.body == null ||
    typeof bodyResult.body !== "object" ||
    Array.isArray(bodyResult.body)
  ) {
    return new Response("Invalid request body", { status: 400 });
  }
  const body = bodyResult.body as WorkspaceChatRequestBody;

  const { sessionId, turnId } = body;
  const submittedMessage = resolveSubmittedMessage(body);
  if (
    !sessionId ||
    typeof sessionId !== "string" ||
    typeof turnId !== "string" ||
    turnId.length === 0 ||
    turnId.length > 96 ||
    submittedMessage.length === 0
  ) {
    return new Response("Invalid request body", { status: 400 });
  }

  return streamWorkspaceChat({
    db,
    sessionId,
    userId: session.user.id,
    message: submittedMessage,
    turnId,
    modelName: resolveModelPreference(req, body.model),
    signal: req.signal,
  });
};
