import type { NextRequest } from "next/server";

import { recordWebVitalPerformance } from "@acme/api/performance";
import { db } from "@acme/db/client";
import { RecordWebVitalSchema } from "@acme/validators";

import { requireSession } from "~/app/api/_lib/require-session";

const MAX_BODY_BYTES = 2_048;

export const POST = async (req: NextRequest) => {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  const bodyPromise = (req.json() as Promise<unknown>).catch(() => null);
  const [session, body] = await Promise.all([requireSession(req), bodyPromise]);
  if (!session) return new Response(null, { status: 401 });

  const parsed = RecordWebVitalSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  try {
    await recordWebVitalPerformance(db, parsed.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.warn("Web Vital metric was not saved.", {
      error: error instanceof Error ? error.name : "UnknownError",
      metric: parsed.data.name,
    });
    return new Response(null, { status: 503 });
  }
};
