import type { NextRequest } from "next/server";

import { recordWebVitalPerformance } from "@acme/api/performance";
import { db } from "@acme/db/client";
import { RecordWebVitalSchema } from "@acme/validators";

import { requireSession } from "~/app/api/_lib/require-session";
import { readJsonBody } from "../../_lib/read-json-body";

const MAX_BODY_BYTES = 2_048;

export const POST = async (req: NextRequest) => {
  const [session, bodyResult] = await Promise.all([
    requireSession(req),
    readJsonBody(req, MAX_BODY_BYTES),
  ]);
  if (!session) return new Response(null, { status: 401 });
  if (bodyResult.status === "too_large") {
    return new Response(null, { status: 413 });
  }
  if (bodyResult.status === "invalid") {
    return new Response(null, { status: 400 });
  }

  const parsed = RecordWebVitalSchema.safeParse(bodyResult.body);
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
