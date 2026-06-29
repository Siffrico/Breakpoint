import type { NextRequest } from "next/server";

import { streamUnitCoach, UnitCoachRequestSchema } from "@acme/api/unit-coach";
import { db } from "@acme/db/client";

import { requireSession } from "~/app/api/_lib/require-session";

export const runtime = "nodejs";

export const POST = async (req: NextRequest) => {
  const session = await requireSession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = UnitCoachRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!body.success) {
    return new Response("Invalid request body", { status: 400 });
  }

  return streamUnitCoach({
    db,
    sessionId: body.data.sessionId,
    userId: session.user.id,
    intent: body.data.intent,
    messages: body.data.messages,
  });
};
