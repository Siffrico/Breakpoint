import type { db as databaseClient } from "@acme/db/client";
import type {
  UnitDifficultySnapshot,
  UnitReviewChallenge,
} from "@acme/validators";
import { and, eq, isNull } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";
import {
  EducationExperienceSnapshotSchema,
  UnitContextSchema,
  UnitCursorSchema,
  UnitRunKindSchema,
} from "@acme/validators";

import type { PersistedUnitRun } from "../domain/training/education-unit/unit-state";
import { projectUnitRun } from "../domain/training/education-unit/unit-state";

type Database = typeof databaseClient;

const mapUnitRun = (
  row: typeof TrainingUnitRun.$inferSelect,
): PersistedUnitRun => {
  const experience = EducationExperienceSnapshotSchema.parse(
    row.experienceJson,
  );
  if (
    experience.id !== row.experienceId ||
    experience.version !== row.experienceVersion
  ) {
    throw new Error(
      "Unit run experience identity does not match its immutable snapshot.",
    );
  }
  return projectUnitRun({
    unitId: row.unitContentId,
    sessionId: row.sessionId,
    userId: row.userId,
    kind: UnitRunKindSchema.parse(row.kind),
    experience,
    unitContext: UnitContextSchema.parse(row.unitContextJson),
    cursor: UnitCursorSchema.parse(row.cursorJson),
    difficultySnapshot: row.difficultySnapshotJson,
  });
};

const tryMapUnitRun = (
  row: typeof TrainingUnitRun.$inferSelect,
): PersistedUnitRun | null =>
  UnitContextSchema.safeParse(row.unitContextJson).success &&
  UnitCursorSchema.safeParse(row.cursorJson).success
    ? mapUnitRun(row)
    : null;

export const trainingUnitRunRepository = {
  getUnitRun: async ({
    db,
    sessionId,
    unitContentId,
  }: {
    db: Database;
    sessionId: string;
    unitContentId: string;
  }): Promise<PersistedUnitRun | null> => {
    const row = await db.query.TrainingUnitRun.findFirst({
      where: and(
        eq(TrainingUnitRun.sessionId, sessionId),
        eq(TrainingUnitRun.unitContentId, unitContentId),
        eq(TrainingUnitRun.kind, "education"),
      ),
    });
    return row ? tryMapUnitRun(row) : null;
  },

  setPendingChallenge: async ({
    db,
    sessionId,
    unitContentId,
    kind,
    pass,
    challenge,
    difficultySnapshot,
  }: {
    db: Database;
    sessionId: string;
    unitContentId: string;
    kind: string;
    pass: number;
    challenge: UnitReviewChallenge;
    difficultySnapshot: UnitDifficultySnapshot;
  }): Promise<void> => {
    const row = await db.query.TrainingUnitRun.findFirst({
      where: and(
        eq(TrainingUnitRun.sessionId, sessionId),
        eq(TrainingUnitRun.unitContentId, unitContentId),
        eq(TrainingUnitRun.kind, kind),
      ),
    });
    if (!row) return;
    const run = tryMapUnitRun(row);
    if (!run) return;
    const step = run.cursor.step;
    if (
      step.kind !== "pass_result" ||
      step.attempt + 1 !== pass ||
      step.preparedScenario
    ) {
      return;
    }
    await db
      .update(TrainingUnitRun)
      .set({
        difficultySnapshotJson: difficultySnapshot,
        cursorJson: {
          ...run.cursor,
          step: { ...step, preparedScenario: challenge },
        },
      })
      .where(
        and(
          eq(TrainingUnitRun.id, row.id),
          eq(TrainingUnitRun.cursorJson, row.cursorJson),
          isNull(TrainingUnitRun.turnLeaseId),
        ),
      );
  },

  upsertUnitRun: async ({
    db,
    run,
  }: {
    db: Database;
    run: PersistedUnitRun;
  }): Promise<PersistedUnitRun> => {
    const values = {
      sessionId: run.sessionId,
      unitContentId: run.unitId,
      userId: run.userId,
      kind: run.kind,
      experienceId: run.experience.id,
      experienceVersion: run.experience.version,
      experienceJson: run.experience,
      unitContextJson: run.unitContext,
      cursorJson: run.cursor,
      difficultySnapshotJson: run.difficultySnapshot,
    };
    const [row] = await db
      .insert(TrainingUnitRun)
      .values(values)
      .onConflictDoUpdate({
        target: [
          TrainingUnitRun.sessionId,
          TrainingUnitRun.unitContentId,
          TrainingUnitRun.kind,
        ],
        set: {
          userId: values.userId,
          experienceId: values.experienceId,
          experienceVersion: values.experienceVersion,
          experienceJson: values.experienceJson,
          unitContextJson: values.unitContextJson,
          cursorJson: values.cursorJson,
          difficultySnapshotJson: values.difficultySnapshotJson,
        },
      })
      .returning();
    if (!row) throw new Error("Unit run could not be saved.");
    return mapUnitRun(row);
  },
};
