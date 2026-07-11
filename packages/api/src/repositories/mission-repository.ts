import type { db as databaseClient } from "@acme/db/client";
import type {
  MissionEvaluation,
  MissionPlan,
  MissionProof,
  MissionSpec,
} from "@acme/validators";
import { and, asc, eq, inArray, sql } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingMission,
  TrainingMissionEvaluation,
  TrainingUnitContent,
  TrainingUnitRun,
} from "@acme/db/schema";

import { RESUMABLE_MISSION_STATUSES } from "../domain/training/missions/mission-lifecycle";

type Database = typeof databaseClient;
const STALE_EVALUATION_MS = 2 * 60 * 1_000;

export const missionRepository = {
  findUnitRunId: async ({
    db,
    userId,
    unitContentId,
    sessionId,
  }: {
    db: Database;
    userId: string;
    unitContentId: string;
    sessionId: string;
  }) =>
    (
      await db.query.TrainingUnitRun.findFirst({
        columns: { id: true },
        where: and(
          eq(TrainingUnitRun.userId, userId),
          eq(TrainingUnitRun.unitContentId, unitContentId),
          eq(TrainingUnitRun.sessionId, sessionId),
        ),
      })
    )?.id ?? null,

  getEligibleRun: async ({
    db,
    userId,
    unitRunId,
  }: {
    db: Database;
    userId: string;
    unitRunId: string;
  }) => {
    const run = await db.query.TrainingUnitRun.findFirst({
      where: and(
        eq(TrainingUnitRun.id, unitRunId),
        eq(TrainingUnitRun.userId, userId),
      ),
    });
    if (!run) return null;

    const unit = await db.query.TrainingUnitContent.findFirst({
      where: eq(TrainingUnitContent.id, run.unitContentId),
    });
    const node = unit
      ? await db.query.TrainingCurriculumNode.findFirst({
          where: eq(TrainingCurriculumNode.id, unit.nodeId),
        })
      : null;
    const parent = node?.parentNodeId
      ? await db.query.TrainingCurriculumNode.findFirst({
          where: eq(TrainingCurriculumNode.id, node.parentNodeId),
        })
      : null;
    return {
      run,
      unit,
      node,
      eligible:
        run.phase === "mastered" &&
        (parent?.kind === "ability" || parent?.kind === "skill_cluster"),
    };
  },

  getByUnitRun: ({
    db,
    userId,
    unitRunId,
  }: {
    db: Database;
    userId: string;
    unitRunId: string;
  }) =>
    db.query.TrainingMission.findFirst({
      where: and(
        eq(TrainingMission.userId, userId),
        eq(TrainingMission.unitRunId, unitRunId),
      ),
    }),

  listEvaluations: ({ db, missionId }: { db: Database; missionId: string }) =>
    db.query.TrainingMissionEvaluation.findMany({
      where: eq(TrainingMissionEvaluation.missionId, missionId),
      orderBy: asc(TrainingMissionEvaluation.attemptNumber),
    }),

  reserveEvaluation: ({
    db,
    userId,
    unitRunId,
    proof,
  }: {
    db: Database;
    userId: string;
    unitRunId: string;
    proof: MissionProof;
  }) =>
    db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      await transactionDb.execute(
        sql`select pg_advisory_xact_lock(hashtext(${unitRunId}), hashtext('mission-evaluation'))`,
      );
      const mission = await transactionDb.query.TrainingMission.findFirst({
        where: and(
          eq(TrainingMission.userId, userId),
          eq(TrainingMission.unitRunId, unitRunId),
        ),
      });
      if (
        mission?.status !== "active" ||
        !mission.spec ||
        !mission.plan
      )
        return { kind: "unavailable" as const };

      const attempts =
        await transactionDb.query.TrainingMissionEvaluation.findMany({
          where: eq(TrainingMissionEvaluation.missionId, mission.id),
          orderBy: asc(TrainingMissionEvaluation.attemptNumber),
        });
      const pendingAttempt = attempts.find(
        (attempt) => attempt.status === "evaluating",
      );
      if (pendingAttempt) {
        if (Date.now() - pendingAttempt.createdAt.getTime() < STALE_EVALUATION_MS)
          return { kind: "already-evaluating" as const };
        await transactionDb
          .delete(TrainingMissionEvaluation)
          .where(eq(TrainingMissionEvaluation.id, pendingAttempt.id));
      }

      const evaluatedAttempts = attempts.filter(
        (attempt) => attempt.status === "evaluated",
      );
      const attemptNumber = evaluatedAttempts.length + 1;
      const [attempt] = await transactionDb
        .insert(TrainingMissionEvaluation)
        .values({ missionId: mission.id, attemptNumber, proof })
        .returning({ id: TrainingMissionEvaluation.id });
      if (!attempt) return { kind: "unavailable" as const };

      return {
        kind: "reserved" as const,
        attemptId: attempt.id,
        attemptNumber,
        firstScore: evaluatedAttempts[0]?.evaluation?.score ?? null,
        mission: { ...mission, spec: mission.spec, plan: mission.plan },
      };
    }),

  cancelEvaluation: ({ db, attemptId }: { db: Database; attemptId: string }) =>
    db
      .delete(TrainingMissionEvaluation)
      .where(
        and(
          eq(TrainingMissionEvaluation.id, attemptId),
          eq(TrainingMissionEvaluation.status, "evaluating"),
        ),
      ),

  finishEvaluation: ({
    db,
    missionId,
    attemptId,
    proof,
    evaluation,
  }: {
    db: Database;
    missionId: string;
    attemptId: string;
    proof: MissionProof;
    evaluation: MissionEvaluation;
  }) =>
    db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      const updatedAttempt = await transactionDb
        .update(TrainingMissionEvaluation)
        .set({ status: "evaluated", evaluation })
        .where(
          and(
            eq(TrainingMissionEvaluation.id, attemptId),
            eq(TrainingMissionEvaluation.missionId, missionId),
            eq(TrainingMissionEvaluation.status, "evaluating"),
          ),
        )
        .returning({ id: TrainingMissionEvaluation.id });
      if (updatedAttempt.length === 0) return false;
      if (evaluation.passed) {
        await transactionDb
          .update(TrainingMission)
          .set({
            proof,
            debrief: evaluation.summary,
            status: "completed",
          })
          .where(eq(TrainingMission.id, missionId));
      }
      return true;
    }),

  listResumable: ({
    db,
    userId,
    sessionId,
  }: {
    db: Database;
    userId: string;
    sessionId: string;
  }) =>
    db
      .select({
        unitRunId: TrainingMission.unitRunId,
        status: TrainingMission.status,
        spec: TrainingMission.spec,
      })
      .from(TrainingMission)
      .innerJoin(
        TrainingUnitRun,
        eq(TrainingMission.unitRunId, TrainingUnitRun.id),
      )
      .where(
        and(
          eq(TrainingMission.userId, userId),
          eq(TrainingUnitRun.sessionId, sessionId),
          inArray(TrainingMission.status, RESUMABLE_MISSION_STATUSES),
        ),
      ),

  upsertDraft: async ({
    db,
    userId,
    unitRunId,
    messages,
  }: {
    db: Database;
    userId: string;
    unitRunId: string;
    messages: unknown[];
  }) => {
    const [row] = await db
      .insert(TrainingMission)
      .values({ userId, unitRunId, messages })
      .onConflictDoUpdate({
        target: TrainingMission.unitRunId,
        set: { messages },
      })
      .returning();
    return row;
  },

  confirmPlan: async ({
    db,
    userId,
    unitRunId,
    spec,
    plan,
  }: {
    db: Database;
    userId: string;
    unitRunId: string;
    spec: MissionSpec;
    plan: MissionPlan;
  }) => {
    const [row] = await db
      .insert(TrainingMission)
      .values({ userId, unitRunId, spec, plan, messages: [] })
      .onConflictDoUpdate({
        target: TrainingMission.unitRunId,
        set: { spec, plan },
      })
      .returning();
    return row;
  },

  start: ({
    db,
    userId,
    unitRunId,
  }: {
    db: Database;
    userId: string;
    unitRunId: string;
  }) =>
    db
      .update(TrainingMission)
      .set({ status: "active" })
      .where(
        and(
          eq(TrainingMission.userId, userId),
          eq(TrainingMission.unitRunId, unitRunId),
          inArray(
            TrainingMission.status,
            RESUMABLE_MISSION_STATUSES,
          ),
        ),
      )
      .returning(),
};
