import type { db as databaseClient } from "@acme/db/client";
import { sql } from "@acme/db";

type Database = typeof databaseClient;

const SKILL_KNOWLEDGE_BUILD_LOCK_SCOPE = "build-skill-knowledge";

/**
 * Serializes the full knowledge check → model → persist path for one skill.
 * The callback receives the lock transaction so it never needs a second pool
 * connection while the model call is in flight.
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
  db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('idle_in_transaction_session_timeout', '0', true)`,
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${skillNodeId}), hashtext(${SKILL_KNOWLEDGE_BUILD_LOCK_SCOPE}))`,
    );
    return run(tx as unknown as Database);
  });
