import type { db as databaseClient } from "@acme/db/client";

import { trainingCurriculumRepository } from "./repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";

type Database = typeof databaseClient;

const encoder = new TextEncoder();
const CHECK_INTERVAL_MS = 1_000;
const CONNECTION_LIFETIME_MS = 25_000;

const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

export const streamWorkspaceEvents = async ({
  db,
  sessionId,
  nodeId,
  userId,
  signal,
}: {
  db: Database;
  sessionId: string;
  nodeId: string;
  userId: string;
  signal: AbortSignal;
}): Promise<Response> => {
  const learningSession = await trainingOnboardingRepository.getSession({
    db,
    sessionId,
  });
  if (learningSession?.userId !== userId) {
    return new Response("Not found", { status: 404 });
  }

  // The node must belong to this session's plan — without this check, unit
  // readiness would be a cross-tenant existence oracle for arbitrary node ids.
  const planNodes = await trainingCurriculumRepository.getPlanNodesBySession({
    db,
    sessionId,
  });
  if (!planNodes?.some((node) => node.id === nodeId)) {
    return new Response("Not found", { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The client can disconnect at any await point; after that every
      // enqueue/close throws on the cancelled controller, so each write is
      // gated on the signal and the whole loop tolerates a dead controller.
      const send = (chunk: string) => {
        if (signal.aborted) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          return false;
        }
      };

      const startedAt = Date.now();
      send(": connected\n\n");

      while (
        !signal.aborted &&
        Date.now() - startedAt < CONNECTION_LIFETIME_MS
      ) {
        const unit = await trainingCurriculumRepository.getUnitByNodeId({
          db,
          nodeId,
        });
        if (unit) {
          send(`event: unit_ready\ndata: ${JSON.stringify({ nodeId })}\n\n`);
          break;
        }

        await wait(CHECK_INTERVAL_MS, signal);
      }

      try {
        controller.close();
      } catch {
        // Already cancelled by the client — nothing to close.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
};
