import type { db as databaseClient } from "@acme/db/client";

import type { NodeBuildLeaseGuard } from "./node-build-lifecycle";
import { withNodeBuildLifecycle } from "./node-build-lifecycle";

type Database = typeof databaseClient;

/**
 * Serializes knowledge generation through a durable lease without retaining a
 * database transaction or pooled connection during the model call.
 */
export const withSkillKnowledgeBuildLock = async <T>({
  db,
  skillNodeId,
  build,
  loadReady,
}: {
  db: Database;
  skillNodeId: string;
  build: (lockDb: Database, withLease: NodeBuildLeaseGuard) => Promise<T>;
  loadReady: (db: Database) => Promise<T>;
}): Promise<T> =>
  withNodeBuildLifecycle({
    db,
    kind: "skill_knowledge",
    nodeId: skillNodeId,
    build,
    loadReady,
  });
