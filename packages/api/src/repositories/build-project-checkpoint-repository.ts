import type { db as databaseClient } from "@acme/db/client";
import { and, eq, inArray, lt } from "@acme/db";
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

const STALE_BUILD_RECLAIM_MS = 360_000; // 6 min > 300s route ceiling

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "23505";

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
  getRun: async ({ db, sessionId }: { db: Database; sessionId: string }) => {
    const checkpoint = await db.query.TrainingProjectBuildCheckpoint.findFirst({
      where: and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
      ),
    });

    return isProjectBuildRunPayload(checkpoint?.payload)
      ? checkpoint.payload
      : null;
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
    { status: "claimed" } | { status: "processing"; state: ProjectBuildState }
  > => {
    try {
      await db
        .insert(TrainingProjectBuildCheckpoint)
        .values({
          sessionId,
          step: "run",
          sourceKey,
          payload,
        })
        .returning();

      return { status: "claimed" };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
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
      const staleBefore = new Date(Date.now() - STALE_BUILD_RECLAIM_MS);
      const [reclaimed] = await db
        .update(TrainingProjectBuildCheckpoint)
        .set({ sourceKey, payload, updatedAt: new Date() })
        .where(
          and(
            eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
            eq(TrainingProjectBuildCheckpoint.step, "run"),
            lt(TrainingProjectBuildCheckpoint.updatedAt, staleBefore),
          ),
        )
        .returning();
      if (reclaimed) {
        return { status: "claimed" };
      }
      return { status: "processing", state: existingPayload.state };
    }

    await db
      .update(TrainingProjectBuildCheckpoint)
      .set({
        sourceKey,
        payload,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
          eq(TrainingProjectBuildCheckpoint.step, "run"),
        ),
      )
      .returning();

    return { status: "claimed" };
  },

  updateRun: async ({
    db,
    sessionId,
    sourceKey,
    payload,
  }: {
    db: Database;
    sessionId: string;
    sourceKey: string;
    payload: ProjectBuildRunPayload;
  }) => {
    const [checkpoint] = await db
      .update(TrainingProjectBuildCheckpoint)
      .set({
        sourceKey,
        payload,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
          eq(TrainingProjectBuildCheckpoint.step, "run"),
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
        inArray(TrainingProjectBuildCheckpoint.step, ["curriculum", "overview"]),
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
