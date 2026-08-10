import { randomUUID } from "node:crypto";
import { Data } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, eq, sql } from "@acme/db";
import { TrainingNodeBuild } from "@acme/db/schema";

type Database = typeof databaseClient;
/**
 * `unit_creation` is keyed by the *skill/outcome* node and guards appending a
 * unit to it; `unit_content` is keyed by the resulting unit node and guards
 * filling it in. Both are needed: without the former, two concurrent callers
 * each append their own unit before either has a unit id to lock on.
 */
type BuildKind = "skill_knowledge" | "unit_content" | "unit_creation";

const LEASE_MS = 60_000;
const HEARTBEAT_MS = 20_000;
const WAIT_MS = 180_000;
const POLL_MS = 750;

export class NodeBuildLeaseLostError extends Data.TaggedError(
  "NodeBuildLeaseLostError",
)<{
  readonly kind: BuildKind;
  readonly nodeId: string;
  readonly cause?: unknown;
}> {}

const failureCodeOf = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    return String(error._tag).slice(0, 64);
  }
  return error instanceof Error ? error.name.slice(0, 64) : "UnknownError";
};

const failureMessageOf = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message.slice(0, 2_000)
    : "Artifact generation failed.";

const claim = async ({
  db,
  kind,
  nodeId,
  rebuildReady = false,
}: {
  db: Database;
  kind: BuildKind;
  nodeId: string;
  rebuildReady?: boolean;
}) =>
  db.transaction(async (tx) => {
    const transactionDb = tx as unknown as Database;
    await transactionDb.execute(
      sql`select pg_advisory_xact_lock(hashtext(${nodeId}), hashtext(${kind}))`,
    );
    const existing = await transactionDb.query.TrainingNodeBuild.findFirst({
      where: and(
        eq(TrainingNodeBuild.kind, kind),
        eq(TrainingNodeBuild.nodeId, nodeId),
      ),
    });
    const now = new Date();
    if (existing?.status === "ready" && !rebuildReady) {
      return { status: "ready" as const };
    }
    if (
      existing?.status === "running" &&
      existing.leaseExpiresAt &&
      existing.leaseExpiresAt > now
    ) {
      return { status: "running" as const };
    }

    const leaseId = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
    if (existing) {
      await transactionDb
        .update(TrainingNodeBuild)
        .set({
          status: "running",
          attempts: existing.attempts + 1,
          leaseId,
          leaseExpiresAt,
          failureCode: null,
          failureMessage: null,
          startedAt: now,
          completedAt: null,
          updatedAt: now,
        })
        .where(eq(TrainingNodeBuild.id, existing.id));
    } else {
      await transactionDb.insert(TrainingNodeBuild).values({
        nodeId,
        kind,
        status: "running",
        attempts: 1,
        leaseId,
        leaseExpiresAt,
        startedAt: now,
      });
    }
    return { status: "claimed" as const, leaseId };
  });

/**
 * Outcome of waiting on another invocation's build.
 *
 * `ready` — the owner finished; read its rows.
 * `takeover` — the owner died (expired lease, or never finished within the
 *   wait window). The work is abandoned and reclaimable, so the waiter becomes
 *   the new owner rather than reporting a failure for work nobody is doing.
 */
type WaitOutcome = "ready" | "takeover";

const waitForOwner = async ({
  db,
  kind,
  nodeId,
}: {
  db: Database;
  kind: BuildKind;
  nodeId: string;
}): Promise<WaitOutcome> => {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const build = await db.query.TrainingNodeBuild.findFirst({
      where: and(
        eq(TrainingNodeBuild.kind, kind),
        eq(TrainingNodeBuild.nodeId, nodeId),
      ),
    });
    if (build?.status === "ready") return "ready";
    if (build?.status === "failed") {
      throw new Error(build.failureMessage ?? "Artifact generation failed.");
    }
    if (
      build?.status === "running" &&
      build.leaseExpiresAt &&
      build.leaseExpiresAt <= new Date()
    ) {
      return "takeover";
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return "takeover";
};

export const withNodeBuildLifecycle = async <T>({
  db,
  kind,
  nodeId,
  build,
  loadReady,
  rebuildReady = false,
}: {
  db: Database;
  kind: BuildKind;
  nodeId: string;
  build: (db: Database) => Promise<T>;
  loadReady: (db: Database) => Promise<T>;
  rebuildReady?: boolean;
}): Promise<T> => {
  let ownership = await claim({ db, kind, nodeId, rebuildReady });
  while (ownership.status === "running") {
    const outcome = await waitForOwner({ db, kind, nodeId });
    if (outcome === "ready") return loadReady(db);
    // Reclaim only after the prior owner is gone. A concurrent waiter may win
    // this claim, in which case the loop waits for that owner instead of
    // running unowned work.
    ownership = await claim({ db, kind, nodeId });
  }
  if (ownership.status === "ready") return loadReady(db);

  const heartbeat = setInterval(() => {
    void db
      .update(TrainingNodeBuild)
      .set({
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingNodeBuild.kind, kind),
          eq(TrainingNodeBuild.nodeId, nodeId),
          eq(TrainingNodeBuild.leaseId, ownership.leaseId),
        ),
      );
  }, HEARTBEAT_MS);

  try {
    const result = await build(db);
    const [completed] = await db
      .update(TrainingNodeBuild)
      .set({
        status: "ready",
        leaseId: null,
        leaseExpiresAt: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingNodeBuild.kind, kind),
          eq(TrainingNodeBuild.nodeId, nodeId),
          eq(TrainingNodeBuild.leaseId, ownership.leaseId),
        ),
      )
      .returning({ id: TrainingNodeBuild.id });
    if (!completed) {
      throw new NodeBuildLeaseLostError({ kind, nodeId });
    }
    return result;
  } catch (error) {
    if (error instanceof NodeBuildLeaseLostError) throw error;
    const [failed] = await db
      .update(TrainingNodeBuild)
      .set({
        status: "failed",
        leaseId: null,
        leaseExpiresAt: null,
        failureCode: failureCodeOf(error),
        failureMessage: failureMessageOf(error),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingNodeBuild.kind, kind),
          eq(TrainingNodeBuild.nodeId, nodeId),
          eq(TrainingNodeBuild.leaseId, ownership.leaseId),
        ),
      )
      .returning({ id: TrainingNodeBuild.id });
    if (!failed) {
      throw new NodeBuildLeaseLostError({
        kind,
        nodeId,
        cause: error,
      });
    }
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
};
