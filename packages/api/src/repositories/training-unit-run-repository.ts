import type { db as databaseClient } from "@acme/db/client";
import { and, eq } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";

import type { UnitRun } from "../domain/training/workspace-ai/workflow";
import { WorkspaceAiEducationStageSchema } from "../domain/training/workspace-ai/types";
import { VERDICT_RULEBOOK_WORKFLOW_ID } from "../domain/training/workspace-ai/workflow";

type Database = typeof databaseClient;

const mapUnitRun = (row: typeof TrainingUnitRun.$inferSelect): UnitRun => ({
  sessionId: row.sessionId,
  unitContentId: row.unitContentId,
  userId: row.userId,
  workflowId: VERDICT_RULEBOOK_WORKFLOW_ID,
  currentStepId: parsePersistedStepId(row.currentStepId),
  stepScenarioCount: row.stepScenarioCount,
});

const parsePersistedStepId = (stepId: string): UnitRun["currentStepId"] =>
  WorkspaceAiEducationStageSchema.parse(stepId);

export const trainingUnitRunRepository = {
  getUnitRun: async ({
    db,
    sessionId,
    unitContentId,
  }: {
    db: Database;
    sessionId: string;
    unitContentId: string;
  }): Promise<UnitRun | null> => {
    const row = await db.query.TrainingUnitRun.findFirst({
      where: and(
        eq(TrainingUnitRun.sessionId, sessionId),
        eq(TrainingUnitRun.unitContentId, unitContentId),
      ),
    });

    return row ? mapUnitRun(row) : null;
  },

  upsertUnitRun: async ({
    db,
    run,
  }: {
    db: Database;
    run: UnitRun;
  }): Promise<UnitRun> => {
    const [row] = await db
      .insert(TrainingUnitRun)
      .values({
        sessionId: run.sessionId,
        unitContentId: run.unitContentId,
        userId: run.userId ?? null,
        workflowId: VERDICT_RULEBOOK_WORKFLOW_ID,
        currentStepId: run.currentStepId,
        stepScenarioCount: run.stepScenarioCount,
      })
      .onConflictDoUpdate({
        target: [TrainingUnitRun.sessionId, TrainingUnitRun.unitContentId],
        set: {
          userId: run.userId ?? null,
          workflowId: VERDICT_RULEBOOK_WORKFLOW_ID,
          currentStepId: run.currentStepId,
          stepScenarioCount: run.stepScenarioCount,
        },
      })
      .returning();

    if (!row) {
      throw new Error("Unit run could not be saved.");
    }

    return mapUnitRun(row);
  },
};
