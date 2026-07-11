import type { db as databaseClient } from "@acme/db/client";
import type { MissionPlan, MissionProof, MissionSpec } from "@acme/validators";
import { and, eq } from "@acme/db";
import { TrainingMission } from "@acme/db/schema";

type Database = typeof databaseClient;

export const missionRepository = {
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
        set: { spec, plan, status: "drafting" },
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
        ),
      ),

  appendMessages: ({
    db,
    userId,
    unitRunId,
    messages,
  }: {
    db: Database;
    userId: string;
    unitRunId: string;
    messages: unknown[];
  }) =>
    db
      .update(TrainingMission)
      .set({ messages })
      .where(
        and(
          eq(TrainingMission.userId, userId),
          eq(TrainingMission.unitRunId, unitRunId),
        ),
      ),

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
        ),
      ),

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
        ),
      ),
};
