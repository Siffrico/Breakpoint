import type { db as databaseClient } from "@acme/db/client";

import { withNodeBuildLifecycle } from "./node-build-lifecycle";

type Database = typeof databaseClient;

/**
 * Serializes knowledge generation through a durable lease without retaining a
 * database transaction or pooled connection during the model call.
 */
export const withSkillKnowledgeBuildLock = async <T>({
  db,
  skillNodeId,
  run,
}: {
  db: Database;
  skillNodeId: string;
  run: (lockDb: Database) => Promise<T>;
}): Promise<T> =>
  withNodeBuildLifecycle({
    db,
    kind: "skill_knowledge",
    nodeId: skillNodeId,
    run,
  });
