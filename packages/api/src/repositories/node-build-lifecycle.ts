import { randomUUID } from "node:crypto";

import type { db as databaseClient } from "@acme/db/client";
import { and, eq, sql } from "@acme/db";
import { TrainingNodeBuild } from "@acme/db/schema";

type Database = typeof databaseClient;
type BuildKind = "skill_knowledge" | "unit_content";

const LEASE_MS = 60_000;
const HEARTBEAT_MS = 20_000;
const WAIT_MS = 180_000;
const POLL_MS = 750;

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
}: {
  db: Database;
  kind: BuildKind;
  nodeId: string;
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
    if (existing?.status === "ready") return { status: "ready" as const };
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

const waitForOwner = async ({
  db,
  kind,
  nodeId,
}: {
  db: Database;
  kind: BuildKind;
  nodeId: string;
}) => {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const build = await db.query.TrainingNodeBuild.findFirst({
      where: and(
        eq(TrainingNodeBuild.kind, kind),
        eq(TrainingNodeBuild.nodeId, nodeId),
      ),
    });
    if (build?.status === "ready") return;
    if (build?.status === "failed") {
      throw new Error(build.failureMessage ?? "Artifact generation failed.");
    }
    if (
      build?.status === "running" &&
      build.leaseExpiresAt &&
      build.leaseExpiresAt <= new Date()
    ) {
      throw new Error("Artifact generation lease expired.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error("Artifact generation is still running.");
};

export const withNodeBuildLifecycle = async <T>({
  db,
  kind,
  nodeId,
  run,
}: {
  db: Database;
  kind: BuildKind;
  nodeId: string;
  run: (db: Database) => Promise<T>;
}): Promise<T> => {
  const ownership = await claim({ db, kind, nodeId });
  if (ownership.status === "ready") return run(db);
  if (ownership.status === "running") {
    await waitForOwner({ db, kind, nodeId });
    return run(db);
  }

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
    const result = await run(db);
    await db
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
      );
    return result;
  } catch (error) {
    await db
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
      );
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
};
