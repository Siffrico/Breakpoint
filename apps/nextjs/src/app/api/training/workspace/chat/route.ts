import type { NextRequest } from "next/server";
import { after } from "next/server";

import { streamWorkspaceChat } from "@acme/api/workspace-chat";
import { db } from "@acme/db/client";
import {
  AiModelPreferenceSchema,
  WORKSPACE_CHAT_BODY_MAX_BYTES,
  WORKSPACE_CHAT_MESSAGE_MAX_CHARS,
  WorkspaceChatRequestSchema,
} from "@acme/validators";

import { requireSession } from "~/app/api/_lib/require-session";
import { readJsonBody } from "../../../_lib/read-json-body";

export const runtime = "nodejs";
// An education turn is a multi-model call that streams well past the platform
// default (10-15s on Vercel). Matches the onboarding and mission chat routes.
export const maxDuration = 300;

const AI_MODEL_COOKIE = "bp-ai-model";
const resolveModelPreference = (req: NextRequest, model?: string) => {
  const parsed = AiModelPreferenceSchema.safeParse(
    model ?? req.cookies.get(AI_MODEL_COOKIE)?.value,
  );

  return parsed.success ? parsed.data : null;
};

type WorkspaceChatRequestBody = ReturnType<
  typeof WorkspaceChatRequestSchema.parse
>;
type WorkspaceChatMessage = NonNullable<
  WorkspaceChatRequestBody["messages"]
>[number];

const getTextFromMessage = (message: WorkspaceChatMessage) =>
  message.parts
    .reduce(
      (text, part) =>
        part.type === "text" && typeof part.text === "string"
          ? text + part.text
          : text,
      "",
    )
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
  const requestStartedAt = Date.now();
  const [session, bodyResult] = await Promise.all([
    requireSession(req),
    readJsonBody(req, WORKSPACE_CHAT_BODY_MAX_BYTES),
  ]);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (bodyResult.status === "too_large") {
    return new Response("Request body too large", { status: 413 });
  }
  if (bodyResult.status === "invalid") {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = WorkspaceChatRequestSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return new Response("Invalid request body", { status: 400 });
  }
  const body = parsed.data;

  const { interactionId, sessionId, turnId } = body;
  const action = body.action ?? "submit_answer";
  const submittedMessage = resolveSubmittedMessage(body);
  if (
    (action === "submit_answer" && submittedMessage.length === 0) ||
    submittedMessage.length > WORKSPACE_CHAT_MESSAGE_MAX_CHARS
  ) {
    return new Response("Invalid request body", { status: 400 });
  }

  return streamWorkspaceChat({
    db,
    sessionId,
    userId: session.user.id,
    action,
    interactionId,
    message: submittedMessage,
    turnId,
    modelName: resolveModelPreference(req, body.model),
    requestStartedAt,
    signal: req.signal,
    scheduleBackgroundTask: (task) => after(task),
  });
};
