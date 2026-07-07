import type { NextRequest } from "next/server";

import { streamWorkspaceEvents } from "@acme/api/workspace-events";
import { db } from "@acme/db/client";

import { requireSession } from "~/app/api/_lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest) => {
  const session = await requireSession(request);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  const nodeId = request.nextUrl.searchParams.get("nodeId")?.trim();
  if (!sessionId || !nodeId) {
    return new Response("Missing sessionId or nodeId", { status: 400 });
  }

  return streamWorkspaceEvents({
    db,
    sessionId,
    nodeId,
    userId: session.user.id,
    signal: request.signal,
  });
};
