import type { NextRequest } from "next/server";
import { after } from "next/server";

import {
  streamOnboardingChat,
  streamProjectBuildResume,
} from "@acme/api/onboarding-chat";
import { db } from "@acme/db/client";
import {
  AiModelPreferenceSchema,
  ONBOARDING_CHAT_BODY_MAX_BYTES,
  OnboardingChatRequestSchema,
} from "@acme/validators";

import { auth } from "~/auth/server";
import { readJsonBody } from "../../_lib/read-json-body";

export const runtime = "nodejs";
// Caps a live project build. The stale-run reclaim window in
// `claimProjectBuildRun` MUST exceed this value, so a run still "building" past
// this ceiling is provably dead (the platform would have killed a live one).
// NOTE: plan-dependent — set this to your deployment's real function ceiling
// (Vercel Hobby caps below 300), then keep STALE_BUILD_RECLAIM_MS above it.
export const maxDuration = 300;

const AI_MODEL_COOKIE = "bp-ai-model";

const resolveModelPreference = (req: NextRequest, model?: string) => {
  const parsed = AiModelPreferenceSchema.safeParse(
    model ?? req.cookies.get(AI_MODEL_COOKIE)?.value,
  );

  return parsed.success ? parsed.data : null;
};

export const POST = async (req: NextRequest) => {
  const [session, bodyResult] = await Promise.all([
    auth.api.getSession({ headers: req.headers }),
    readJsonBody(req, ONBOARDING_CHAT_BODY_MAX_BYTES),
  ]);
  const userId = session?.user.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (bodyResult.status === "too_large") {
    return new Response("Request body too large", { status: 413 });
  }
  if (bodyResult.status === "invalid") {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = OnboardingChatRequestSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return new Response("Invalid request body", { status: 400 });
  }
  const body = parsed.data;
  const { sessionId } = body;

  // Resume replays the deterministic build into the existing build card; it
  // needs only the session, not the chat transcript the model turn requires.
  if (body.resumeBuild) {
    return streamProjectBuildResume({
      db,
      sessionId,
      userId,
      modelName: resolveModelPreference(req, body.model),
      scheduleBackgroundTask: (task) => after(task),
    });
  }

  if (!body.messages) {
    return new Response("Invalid request body", { status: 400 });
  }

  return streamOnboardingChat({
    db,
    sessionId,
    userId,
    messages: body.messages,
    modelName: resolveModelPreference(req, body.model),
    scheduleBackgroundTask: (task) => after(task),
  });
};
