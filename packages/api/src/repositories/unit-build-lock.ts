import type { db as databaseClient } from "@acme/db/client";
import { sql } from "@acme/db";

type Database = typeof databaseClient;

/**
 * One advisory lock per unit node is the whole readiness protocol:
 *
 * - The builder holds it across check → generate → persist, so a concurrent
 *   build blocks, re-checks, and skips (singleflight — never two LLM builds).
 * - Readers park on it and are woken by the builder's COMMIT (condition
 *   variable — readiness arrives at commit time, nobody polls).
 * - A crashed builder rolls back, which releases the lock; there is no stale
 *   state to clean up because xact locks die with their transaction.
 */
const UNIT_BUILD_LOCK_SCOPE = "prepare-unit-content";

const unitBuildLockSql = (nodeId: string) =>
  sql`select pg_advisory_xact_lock(hashtext(${nodeId}), hashtext(${UNIT_BUILD_LOCK_SCOPE}))`;

/**
 * Runs `run` while holding the build lock for `nodeId`. The wrapping
 * transaction exists only to pin the lock to one connection; `run` performs
 * its own queries on the pooled client, so the lock connection stays idle
 * (advisory lock only, no row locks) for the duration of the build.
 */
export const withUnitBuildLock = async <T>({
  db,
  nodeId,
  run,
}: {
  db: Database;
  nodeId: string;
  run: () => Promise<T>;
}): Promise<T> =>
  db.transaction(async (tx) => {
    // The lock connection idles while the LLM builds; a server-side
    // idle-in-transaction reaper must not cut it down mid-build.
    await tx.execute(
      sql`select set_config('idle_in_transaction_session_timeout', '0', true)`,
    );
    await tx.execute(unitBuildLockSql(nodeId));
    return run();
  });

/**
 * Parks until the in-flight build for `nodeId` commits (or rolls back), or
 * the deadline passes. Returns true when the lock was acquired — meaning no
 * build is in flight *right now* — and false on deadline. Says nothing about
 * whether the unit row exists; callers read that themselves afterwards.
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
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('lock_timeout', ${String(Math.max(1, Math.trunc(timeoutMs)))}, true)`,
      );
      await tx.execute(unitBuildLockSql(nodeId));
      // Acquired — released immediately by this commit; the wait was the point.
    });
    return true;
  } catch {
    return false;
  }
};
