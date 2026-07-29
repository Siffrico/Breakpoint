import type { db as databaseClient } from "@acme/db/client";
import { and, desc, eq, ne, sql } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";
import {
  EducationExperienceSnapshotSchema,
  UnitCapabilityTodoSchema,
  UnitMasteryContractSchema,
  UnitReviewChallengeSchema,
  UnitReviewTodoSchema,
  UnitRunKindSchema,
  UnitRunModeSchema,
} from "@acme/validators";

import type { PersistedUnitRun } from "../domain/training/education-unit/unit-state";

type Database = typeof databaseClient;

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

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
  const masteryContract = UnitMasteryContractSchema.parse(
    row.masteryContractJson,
  );
  const capabilityTodos = UnitCapabilityTodoSchema.array().parse(
    row.capabilityTodosJson,
  );
  const expectedIds = masteryContract.dimensions.map(
    (dimension) => dimension.id,
  );
  const persistedIds = capabilityTodos.map((todo) => todo.dimensionId);
  if (
    expectedIds.length !== persistedIds.length ||
    expectedIds.some((id, index) => persistedIds[index] !== id)
  ) {
    throw new Error(
      "Unit run capability todos do not match its snapshotted mastery contract.",
    );
  }

  return {
    unitId: row.unitContentId,
    sessionId: row.sessionId,
    userId: row.userId,
    kind: UnitRunKindSchema.parse(row.kind),
    mode: UnitRunModeSchema.parse(row.mode),
    experience,
    masteryContract,
    capabilityTodos,
    reviewTodos: UnitReviewTodoSchema.array().parse(row.reviewTodosJson),
    activeReviewChallenge: UnitReviewChallengeSchema.nullable().parse(
      row.activeReviewChallengeJson,
    ),
    reviewerFeedback: row.reviewerFeedback,
    hasReviewGrade: row.hasReviewGrade,
    difficultySnapshot: row.difficultySnapshotJson,
  };
};

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
      ),
    });

    return row ? mapUnitRun(row) : null;
  },

  getInFlightRecallRun: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<PersistedUnitRun | null> => {
    const row = await db.query.TrainingUnitRun.findFirst({
      where: and(
        eq(TrainingUnitRun.sessionId, sessionId),
        eq(TrainingUnitRun.kind, "recall"),
        ne(TrainingUnitRun.mode, "complete"),
      ),
      orderBy: [desc(TrainingUnitRun.updatedAt)],
    });

    return row ? mapUnitRun(row) : null;
  },

  retireInFlightRecallRun: async ({
    db,
    sessionId,
    unitContentId,
  }: {
    db: Database;
    sessionId: string;
    unitContentId: string;
  }): Promise<void> => {
    await db
      .update(TrainingUnitRun)
      .set({ mode: "complete" })
      .where(
        and(
          eq(TrainingUnitRun.sessionId, sessionId),
          eq(TrainingUnitRun.unitContentId, unitContentId),
          eq(TrainingUnitRun.kind, "recall"),
          ne(TrainingUnitRun.mode, "complete"),
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
      mode: run.mode,
      experienceId: run.experience.id,
      experienceVersion: run.experience.version,
      experienceJson: run.experience,
      masteryContractJson: run.masteryContract,
      capabilityTodosJson: [...run.capabilityTodos],
      reviewTodosJson: [...run.reviewTodos],
      activeReviewChallengeJson: run.activeReviewChallenge,
      reviewerFeedback: run.reviewerFeedback,
      hasReviewGrade: run.hasReviewGrade,
      difficultySnapshotJson: run.difficultySnapshot,
    };

    const [row] = await db
      .insert(TrainingUnitRun)
      .values(values)
      .onConflictDoUpdate({
        target: [TrainingUnitRun.sessionId, TrainingUnitRun.unitContentId],
        set: {
          userId: values.userId,
          kind: values.kind,
          mode: values.mode,
          experienceId: values.experienceId,
          experienceVersion: values.experienceVersion,
          experienceJson: values.experienceJson,
          masteryContractJson: values.masteryContractJson,
          capabilityTodosJson: values.capabilityTodosJson,
          reviewTodosJson: values.reviewTodosJson,
          activeReviewChallengeJson: values.activeReviewChallengeJson,
          reviewerFeedback: values.reviewerFeedback,
          hasReviewGrade: values.hasReviewGrade,
          difficultySnapshotJson: sql`case when ${TrainingUnitRun.kind} = excluded.kind and ${TrainingUnitRun.experienceId} = excluded.experience_id and ${TrainingUnitRun.experienceVersion} = excluded.experience_version and ${TrainingUnitRun.mode} != 'complete' then coalesce(${TrainingUnitRun.difficultySnapshotJson}, excluded.difficulty_snapshot_json) else excluded.difficulty_snapshot_json end`,
        },
      })
      .returning();

    if (!row) {
      throw new Error("Unit run could not be saved.");
    }
    if (
      run.difficultySnapshot &&
      canonicalJson(row.difficultySnapshotJson) !==
        canonicalJson(run.difficultySnapshot)
    ) {
      throw new Error("A unit run's difficulty snapshot cannot be replaced.");
    }

    return mapUnitRun(row);
  },
};
