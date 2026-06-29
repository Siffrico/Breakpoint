import type { NextRequest } from "next/server";
import { z } from "zod/v4";

import { streamUnitAsk } from "@acme/api/unit-ask";
import { db } from "@acme/db/client";

import { requireSession } from "~/app/api/_lib/require-session";

export const runtime = "nodejs";

const AskRequestSchema = z.object({
  sessionId: z.string().min(1),
  intent: z.enum(["idk", "explain", "freeform"]),
  message: z.string().max(4000).optional(),
  unitTitle: z.string().max(300).optional(),
});

export const POST = async (req: NextRequest) => {
  const session = await requireSession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let parsed;
  try {
    parsed = AskRequestSchema.parse(await req.json());
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  if (parsed.intent === "freeform" && (parsed.message?.trim().length ?? 0) < 2) {
    return new Response("Ask a fuller question.", { status: 400 });
  }

  return streamUnitAsk({
    db,
    sessionId: parsed.sessionId,
    userId: session.user.id,
    intent: parsed.intent,
    message: parsed.message ?? null,
    unitTitle: parsed.unitTitle ?? null,
  });
};
