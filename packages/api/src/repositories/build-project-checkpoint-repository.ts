import type { db as databaseClient } from "@acme/db/client";
import { and, eq, inArray, lt, or, sql } from "@acme/db";
import { TrainingProjectBuildCheckpoint } from "@acme/db/schema";

import type { ArtifactFailureKind } from "../domain/training/orchestration/agent-runtime";
import type {
  CreateProjectInput,
  ProjectBuildArtifactRecord,
  ProjectBuildArtifactStatus,
  ProjectBuildArtifactStep,
  ProjectBuildState,
} from "../domain/training/orchestration/build-project";

type Database = typeof databaseClient;

export interface ProjectBuildRunPayload {
  status: "building" | "complete" | "error";
  input: CreateProjectInput;
  state: ProjectBuildState;
  error?: string;
}

const BUILD_LEASE_MS = 120_000;
const ABANDONED_BUILD_ERROR =
  "The project build stopped before completion. Retry to resume it.";

const failedRunPayload = (
  run: ProjectBuildRunPayload,
  error: string,
): ProjectBuildRunPayload => ({
  ...run,
  status: "error",
  error,
  state: {
    ...run.state,
    phase: "error",
    error,
  },
});

const recoverAbandonedRun = async ({
  db,
  checkpoint,
}: {
  db: Database;
  checkpoint: typeof TrainingProjectBuildCheckpoint.$inferSelect;
}): Promise<ProjectBuildRunPayload | null> => {
  if (!isProjectBuildRunPayload(checkpoint.payload)) return null;
  if (checkpoint.payload.status !== "building") return checkpoint.payload;

  if (checkpoint.leaseExpiresAt && checkpoint.leaseExpiresAt > new Date()) {
    return checkpoint.payload;
  }

  const payload = failedRunPayload(checkpoint.payload, ABANDONED_BUILD_ERROR);
  const [recovered] = await db
    .update(TrainingProjectBuildCheckpoint)
    .set({ payload, updatedAt: new Date() })
    .where(
      and(
        eq(TrainingProjectBuildCheckpoint.id, checkpoint.id),
        or(
          lt(TrainingProjectBuildCheckpoint.leaseExpiresAt, new Date()),
          // Legacy rows from before leases are reclaimable immediately.
          sql`${TrainingProjectBuildCheckpoint.leaseExpiresAt} is null`,
        ),
      ),
    )
    .returning();

  return recovered && isProjectBuildRunPayload(recovered.payload)
    ? recovered.payload
    : checkpoint.payload;
};

export const isProjectBuildRunPayload = (
  payload: unknown,
): payload is ProjectBuildRunPayload => {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<ProjectBuildRunPayload>;
  return (
    (candidate.status === "building" ||
      candidate.status === "complete" ||
      candidate.status === "error") &&
    !!candidate.state &&
    typeof candidate.state === "object"
  );
};

export const buildProjectCheckpointRepository = {
  listRunsBySessionIds: async ({
    db,
    sessionIds,
  }: {
    db: Database;
    sessionIds: string[];
  }) => {
    if (sessionIds.length === 0) return [];

    const checkpoints = await db.query.TrainingProjectBuildCheckpoint.findMany({
      where: and(
        inArray(TrainingProjectBuildCheckpoint.sessionId, sessionIds),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
      ),
    });

    const runs = await Promise.all(
      checkpoints.map(async (checkpoint) => ({
        checkpoint,
        run: await recoverAbandonedRun({ db, checkpoint }),
      })),
    );

    return runs.flatMap(({ checkpoint, run }) =>
      run
        ? [
            {
              sessionId: checkpoint.sessionId,
              updatedAt: checkpoint.updatedAt,
              run,
            },
          ]
        : [],
    );
  },

  getRun: async ({ db, sessionId }: { db: Database; sessionId: string }) => {
    const checkpoint = await db.query.TrainingProjectBuildCheckpoint.findFirst({
      where: and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
      ),
    });

    return checkpoint ? recoverAbandonedRun({ db, checkpoint }) : null;
  },

  failRun: async ({
    db,
    sessionId,
    error,
  }: {
    db: Database;
    sessionId: string;
    error: string;
  }) => {
    const checkpoint = await db.query.TrainingProjectBuildCheckpoint.findFirst({
      where: and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
      ),
    });
    if (!checkpoint || !isProjectBuildRunPayload(checkpoint.payload)) {
      return null;
    }
    if (checkpoint.payload.status === "complete") return checkpoint.payload;

    const payload = failedRunPayload(checkpoint.payload, error);
    const [failed] = await db
      .update(TrainingProjectBuildCheckpoint)
      .set({ payload, updatedAt: new Date() })
      .where(eq(TrainingProjectBuildCheckpoint.id, checkpoint.id))
      .returning();

    return failed && isProjectBuildRunPayload(failed.payload)
      ? failed.payload
      : payload;
  },

  claimRun: async ({
    db,
    sessionId,
    sourceKey,
    payload,
  }: {
    db: Database;
    sessionId: string;
    sourceKey: string;
    payload: ProjectBuildRunPayload;
  }): Promise<
    | { status: "claimed"; ownershipToken: string }
    | { status: "processing"; state: ProjectBuildState }
  > => {
    const ownershipToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + BUILD_LEASE_MS);
    const [inserted] = await db
      .insert(TrainingProjectBuildCheckpoint)
      .values({
        sessionId,
        step: "run",
        sourceKey,
        payload,
        leaseId: ownershipToken,
        leaseExpiresAt,
      })
      .onConflictDoNothing({
        target: [
          TrainingProjectBuildCheckpoint.sessionId,
          TrainingProjectBuildCheckpoint.step,
        ],
      })
      .returning();

    if (inserted) {
      return { status: "claimed", ownershipToken };
    }

    const existing = await db.query.TrainingProjectBuildCheckpoint.findFirst({
      where: and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
      ),
    });
    const existingPayload = isProjectBuildRunPayload(existing?.payload)
      ? existing.payload
      : null;

    if (existingPayload?.status === "building") {
      const [reclaimed] = await db
        .update(TrainingProjectBuildCheckpoint)
        .set({ sourceKey, payload, leaseId: ownershipToken, leaseExpiresAt, updatedAt: new Date() })
        .where(
          and(
            eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
            eq(TrainingProjectBuildCheckpoint.step, "run"),
            or(
              lt(TrainingProjectBuildCheckpoint.leaseExpiresAt, new Date()),
              sql`${TrainingProjectBuildCheckpoint.leaseExpiresAt} is null`,
            ),
          ),
        )
        .returning();
      if (reclaimed) {
        return { status: "claimed", ownershipToken };
      }
      return { status: "processing", state: existingPayload.state };
    }

    await db
      .update(TrainingProjectBuildCheckpoint)
      .set({
        sourceKey,
        payload,
        leaseId: ownershipToken,
        leaseExpiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
          eq(TrainingProjectBuildCheckpoint.step, "run"),
        ),
      )
      .returning();

    return { status: "claimed", ownershipToken };
  },

  heartbeatRun: async ({
    db,
    sessionId,
    ownershipToken,
  }: {
    db: Database;
    sessionId: string;
    ownershipToken: string;
  }) => {
    const [checkpoint] = await db
      .update(TrainingProjectBuildCheckpoint)
      .set({ leaseExpiresAt: new Date(Date.now() + BUILD_LEASE_MS), updatedAt: new Date() })
      .where(and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
        eq(TrainingProjectBuildCheckpoint.leaseId, ownershipToken),
      ))
      .returning();
    return checkpoint != null;
  },

  updateRun: async ({
    db,
    sessionId,
    sourceKey,
    payload,
    ownershipToken,
  }: {
    db: Database;
    sessionId: string;
    sourceKey: string;
    payload: ProjectBuildRunPayload;
    ownershipToken: string;
  }) => {
    const [checkpoint] = await db
      .update(TrainingProjectBuildCheckpoint)
      .set({
        sourceKey,
        payload,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
        eq(TrainingProjectBuildCheckpoint.leaseId, ownershipToken),
        ),
      )
      .returning();

    return checkpoint ?? null;
  },

  upsertArtifact: async ({
    db,
    sessionId,
    step,
    sourceKey,
    payload,
    status,
    failureKind = null,
    attempts,
  }: {
    db: Database;
    sessionId: string;
    step: ProjectBuildArtifactStep;
    sourceKey: string;
    payload: unknown;
    status: ProjectBuildArtifactStatus;
    failureKind?: ArtifactFailureKind | null;
    attempts?: number;
  }) => {
    // `payload` is jsonb NOT NULL. A failed artifact with no captured partial
    // and no prior cached payload arrives here as null/undefined; passing that
    // through inserts SQL NULL (23502) and crashes the never-throws
    // orchestrator. `{}` is inert: it is never read as a cached output (every
    // reader schema-validates first) nor as a resume seed (only generating /
    // partial rows are seeded).
    const safePayload = payload ?? {};
    const [checkpoint] = await db
      .insert(TrainingProjectBuildCheckpoint)
      .values({
        sessionId,
        step,
        sourceKey,
        payload: safePayload,
        status,
        failureKind,
        attempts: attempts ?? 0,
      })
      .onConflictDoUpdate({
        target: [
          TrainingProjectBuildCheckpoint.sessionId,
          TrainingProjectBuildCheckpoint.step,
        ],
        set: {
          sourceKey,
          payload: safePayload,
          status,
          failureKind,
          ...(attempts === undefined ? {} : { attempts }),
          updatedAt: new Date(),
        },
      })
      .returning();

    return checkpoint ?? null;
  },

  listArtifacts: async ({
    db,
    sessionId,
    sourceKey,
  }: {
    db: Database;
    sessionId: string;
    sourceKey: string;
  }): Promise<ProjectBuildArtifactRecord[]> => {
    const rows = await db.query.TrainingProjectBuildCheckpoint.findMany({
      where: and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.sourceKey, sourceKey),
        // "goals" is deliberately absent: the learner brief now arrives with the
        // consultant's createProject call, so pre-existing goals rows are inert
        // history. Reading them back would resurrect a stale failed row into
        // `hasUnfinishedArtifact` and permanently block the completed-build
        // short-circuit for sessions built before that change.
        inArray(TrainingProjectBuildCheckpoint.step, [
          "curriculum",
          "overview",
        ]),
      ),
    });

    return rows.map((row) => ({
      step: row.step as ProjectBuildArtifactStep,
      status: row.status as ProjectBuildArtifactStatus,
      attempts: row.attempts,
      failureKind: row.failureKind as ArtifactFailureKind | null,
      payload: row.payload,
    }));
  },
};
