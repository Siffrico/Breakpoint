import type { db as databaseClient } from "@acme/db/client";
import type { MissionPlan, MissionProof, MissionSpec } from "@acme/validators";
import { and, eq, inArray } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingMission,
  TrainingUnitContent,
  TrainingUnitRun,
} from "@acme/db/schema";

import {
  RESUMABLE_MISSION_STATUSES,
  sourceStatusesForMissionTransition,
} from "../domain/training/missions/mission-lifecycle";

type Database = typeof databaseClient;

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
            sourceStatusesForMissionTransition("start"),
          ),
        ),
      )
      .returning(),

  saveProofAndComplete: ({
    db,
    userId,
    unitRunId,
    proof,
    debrief,
  }: {
    db: Database;
    userId: string;
    unitRunId: string;
    proof: MissionProof;
    debrief: string;
  }) =>
    db
      .update(TrainingMission)
      .set({ proof, debrief, status: "completed" })
      .where(
        and(
          eq(TrainingMission.userId, userId),
          eq(TrainingMission.unitRunId, unitRunId),
          inArray(
            TrainingMission.status,
            sourceStatusesForMissionTransition("complete"),
          ),
        ),
      )
      .returning(),

  skip: ({
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
      .set({ status: "skipped" })
      .where(
        and(
          eq(TrainingMission.userId, userId),
          eq(TrainingMission.unitRunId, unitRunId),
          inArray(
            TrainingMission.status,
            sourceStatusesForMissionTransition("skip"),
          ),
        ),
      )
      .returning(),
};
