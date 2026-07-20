import type { db as databaseClient } from "@acme/db/client";
import { sql } from "@acme/db";

type Database = typeof databaseClient;

/**
 * One advisory lock per unit node is the whole readiness protocol:
 *
 * - The builder holds it across check → generate → persist, so a concurrent
 *   build blocks, re-checks, and skips (singleflight — never two LLM builds).
 * - Readers probe it with try-lock statements; acquiring means no build is
 *   in flight right now.
 * - A crashed builder rolls back, which releases the lock; there is no stale
 *   state to clean up because xact locks die with their transaction.
 *
 * Pool discipline: the builder's entire build — lock, reads, LLM wait,
 * persist — rides the one transaction connection (`run` receives it), and
 * reader probes are single statements that release at statement end. No
 * step in the protocol parks a second pooled connection, so concurrent
 * builds and waiters cannot exhaust the pool and starve the builder.
 */
const UNIT_BUILD_LOCK_SCOPE = "prepare-unit-content";

const unitBuildLockSql = (nodeId: string) =>
  sql`select pg_advisory_xact_lock(hashtext(${nodeId}), hashtext(${UNIT_BUILD_LOCK_SCOPE}))`;

const unitBuildTryLockSql = (nodeId: string) =>
  sql`select pg_try_advisory_xact_lock(hashtext(${nodeId}), hashtext(${UNIT_BUILD_LOCK_SCOPE})) as acquired`;

/**
 * Runs `run` while holding the build lock for `nodeId`. `run` receives the
 * lock transaction itself and must perform all of its queries on it — the
 * build takes exactly one pooled connection, no matter how many builds or
 * readiness probes run concurrently.
 */
export const withUnitBuildLock = async <T>({
  db,
  nodeId,
  run,
}: {
  db: Database;
  nodeId: string;
  run: (lockDb: Database) => Promise<T>;
}): Promise<T> =>
  db.transaction(async (tx) => {
    // The lock connection idles during the LLM wait; a server-side
    // idle-in-transaction reaper must not cut it down mid-build.
    await tx.execute(
      sql`select set_config('idle_in_transaction_session_timeout', '0', true)`,
    );
    await tx.execute(unitBuildLockSql(nodeId));
    // The transaction exposes the query surface the repositories need; the
    // cast bridges drizzle typing the transaction narrower than the client.
    return run(tx as unknown as Database);
  });

const READINESS_POLL_INTERVAL_MS = 750;

/**
 * Polls until the in-flight build for `nodeId` commits (or rolls back), or
 * the deadline passes. Returns true when a probe acquired the lock — meaning
 * no build is in flight *right now* — and false on deadline. Says nothing
 * about whether the unit row exists; callers read that themselves afterwards.
 *
 * Each probe is a single autocommit statement, so the acquired lock — and
 * the connection — are released as soon as the statement returns; a waiter
 * never occupies a pooled connection between probes.
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
    const rows = await db.execute(unitBuildTryLockSql(nodeId));
    if (rows[0]?.acquired === true) return true;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return false;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(READINESS_POLL_INTERVAL_MS, remainingMs)),
    );
  }
};
