import type { NextRequest } from "next/server";
import { z } from "zod/v4";

import { streamRecallChat } from "@acme/api/recall-chat";
import { db } from "@acme/db/client";
import {
  AiModelPreferenceSchema,
  RecallSubmitAnswerInputSchema,
  WORKSPACE_CHAT_BODY_MAX_BYTES,
} from "@acme/validators";

import { requireSession } from "~/app/api/_lib/require-session";
import { readJsonBody } from "../../../_lib/read-json-body";

export const runtime = "nodejs";
export const maxDuration = 300;

const RecallChatRequestSchema = RecallSubmitAnswerInputSchema.extend({
  model: z.string().optional(),
}).passthrough();

const resolveModelPreference = (req: NextRequest, model?: string) => {
  const parsed = AiModelPreferenceSchema.safeParse(
    model ?? req.cookies.get("bp-ai-model")?.value,
  );
  return parsed.success ? parsed.data : null;
};

export const POST = async (req: NextRequest) => {
  const [session, bodyResult] = await Promise.all([
    requireSession(req),
    readJsonBody(req, WORKSPACE_CHAT_BODY_MAX_BYTES),
  ]);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (bodyResult.status === "too_large") {
    return new Response("Request body too large", { status: 413 });
  }
  if (bodyResult.status === "invalid") {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = RecallChatRequestSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return new Response("Invalid request body", { status: 400 });
  }
  const { taskId, interactionId, requestId, answer, model } = parsed.data;
  return streamRecallChat({
    db,
    userId: session.user.id,
    taskId,
    interactionId,
    requestId,
    answer,
    modelName: resolveModelPreference(req, model),
    signal: req.signal,
  });
};
