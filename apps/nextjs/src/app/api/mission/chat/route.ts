import type { NextRequest } from "next/server";
import { after } from "next/server";

import { streamMissionChat } from "@acme/api/mission-chat";
import { db } from "@acme/db/client";
import {
  AiModelPreferenceSchema,
  MISSION_CHAT_BODY_MAX_BYTES,
  MissionChatRequestSchema,
} from "@acme/validators";

import { requireSession } from "~/app/api/_lib/require-session";
import { readJsonBody } from "../../_lib/read-json-body";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = async (req: NextRequest) => {
  const [session, bodyResult] = await Promise.all([
    requireSession(req),
    readJsonBody(req, MISSION_CHAT_BODY_MAX_BYTES),
  ]);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (bodyResult.status === "too_large") {
    return new Response("Request body too large", { status: 413 });
  }
  if (bodyResult.status === "invalid") {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = MissionChatRequestSchema.safeParse(bodyResult.body);
  if (!parsed.success)
    return new Response("Invalid request body", { status: 400 });
  const model = AiModelPreferenceSchema.safeParse(
    parsed.data.model ?? req.cookies.get("bp-ai-model")?.value,
  );
  return streamMissionChat({
    db,
    userId: session.user.id,
    unitRunId: parsed.data.unitRunId,
    messages: parsed.data.messages,
    proof: parsed.data.proof,
    modelName: model.success ? model.data : null,
    scheduleBackgroundTask: (task) => after(task),
  });
};
