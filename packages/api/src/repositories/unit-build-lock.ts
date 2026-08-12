import type { db as databaseClient } from "@acme/db/client";
import { and, eq } from "@acme/db";
import { TrainingNodeBuild } from "@acme/db/schema";

import type { NodeBuildLeaseGuard } from "./node-build-lifecycle";
import { withNodeBuildLifecycle } from "./node-build-lifecycle";

type Database = typeof databaseClient;

/** The compatibility boundary used by unit preparation. `build` runs only for
 * the renewable lease owner; ready callers use the read-only loader. */
export const withUnitBuildLock = async <T>({
  db,
  nodeId,
  build,
  loadReady,
  rebuildReady,
}: {
  db: Database;
  nodeId: string;
  build: (lockDb: Database, withLease: NodeBuildLeaseGuard) => Promise<T>;
  loadReady: (db: Database) => Promise<T>;
  rebuildReady?: boolean;
}): Promise<T> =>
  withNodeBuildLifecycle({
    db,
    kind: "unit_content",
    nodeId,
    build,
    loadReady,
    rebuildReady,
  });

const READINESS_POLL_INTERVAL_MS = 750;

/**
 * Polls the durable lifecycle until the build reaches a terminal state or the
 * deadline passes. The caller reads unit content after settlement so `failed`
 * and `ready` remain distinguishable without treating preparation as a 500.
 */
export const awaitUnitBuildSettled = async ({
  db,
  nodeId,
  timeoutMs,
}: {
  db: Database;
  nodeId: string;
  timeoutMs: number;
}): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const build = await db.query.TrainingNodeBuild.findFirst({
      where: and(
        eq(TrainingNodeBuild.kind, "unit_content"),
        eq(TrainingNodeBuild.nodeId, nodeId),
      ),
    });
    if (!build || build.status === "ready" || build.status === "failed") {
      return true;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return false;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(READINESS_POLL_INTERVAL_MS, remainingMs)),
    );
  }
};
