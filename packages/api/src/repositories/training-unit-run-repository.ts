import type { db as databaseClient } from "@acme/db/client";
import type { UnitReviewChallenge, UnitReviewPass } from "@acme/validators";
import { and, desc, eq, isNull, ne, sql } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";
import {
  EducationExperienceSnapshotSchema,
  UnitContextSchema,
  UnitRunKindSchema,
  UnitTodoSchema,
} from "@acme/validators";

import type { PersistedUnitRun } from "../domain/training/education-unit/unit-state";
import { projectUnitRun } from "../domain/training/education-unit/unit-state";

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
  const unitContext = UnitContextSchema.parse(row.unitContextJson);
  const kind = UnitRunKindSchema.parse(row.kind);
  const todos = UnitTodoSchema.array().parse(row.todosJson);

  const persistedIds = todos
    .filter((todo) => todo.kind === "capability")
    .map((todo) => todo.dimensionId);
  if (persistedIds.length !== 1 || persistedIds[0] !== "teach") {
    throw new Error(
      "Unit run must contain exactly one authoritative teaching todo.",
    );
  }

  return projectUnitRun({
    unitId: row.unitContentId,
    sessionId: row.sessionId,
    userId: row.userId,
    kind,
    experience,
    unitContext,
    todos,
    difficultySnapshot: row.difficultySnapshotJson,
  });
};

const tryMapUnitRun = (
  row: typeof TrainingUnitRun.$inferSelect,
): PersistedUnitRun | null =>
  UnitContextSchema.safeParse(row.unitContextJson).success
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

    return row ? tryMapUnitRun(row) : null;
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
    const row = await db.query.TrainingUnitRun.findFirst({
      where: and(
        eq(TrainingUnitRun.sessionId, sessionId),
        eq(TrainingUnitRun.unitContentId, unitContentId),
        eq(TrainingUnitRun.kind, "recall"),
        ne(TrainingUnitRun.mode, "complete"),
      ),
    });
    if (!row) return;

    const run = tryMapUnitRun(row);
    if (!run) {
      await db
        .update(TrainingUnitRun)
        .set({ mode: "complete" })
        .where(eq(TrainingUnitRun.id, row.id));
      return;
    }
    await db
      .update(TrainingUnitRun)
      .set({
        mode: "complete",
        todosJson: run.todos.map((todo) => ({ ...todo, status: "completed" })),
      })
      .where(eq(TrainingUnitRun.id, row.id));
  },

  /**
   * Parks a backgrounded challenge on the run's unopened solve todo. Guarded on
   * the run still waiting with an empty slot and no live turn, so a task that
   * lands after the learner already pressed Enter (or after a second task won
   * the race) is a no-op rather than a challenge swap mid-pass.
   */
  setPendingChallenge: async ({
    db,
    sessionId,
    unitContentId,
    kind,
    pass,
    challenge,
  }: {
    db: Database;
    sessionId: string;
    unitContentId: string;
    kind: string;
    pass: UnitReviewPass;
    challenge: UnitReviewChallenge;
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
    const pending = run.todos.find((todo) => todo.status !== "completed");
    if (
      pending?.kind !== "solve" ||
      pending.pass !== pass ||
      pending.status !== "pending" ||
      pending.challenge
    ) {
      return;
    }
    const todos = run.todos.map((todo) =>
      todo === pending ? { ...todo, challenge } : todo,
    );

    await db
      .update(TrainingUnitRun)
      .set({ todosJson: todos })
      .where(
        and(
          eq(TrainingUnitRun.sessionId, sessionId),
          eq(TrainingUnitRun.unitContentId, unitContentId),
          eq(TrainingUnitRun.kind, kind),
          eq(TrainingUnitRun.todosJson, row.todosJson),
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
      mode: run.mode,
      experienceId: run.experience.id,
      experienceVersion: run.experience.version,
      experienceJson: run.experience,
      unitContextJson: run.unitContext,
      todosJson: [...run.todos],
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
          kind: values.kind,
          mode: values.mode,
          experienceId: values.experienceId,
          experienceVersion: values.experienceVersion,
          experienceJson: values.experienceJson,
          unitContextJson: values.unitContextJson,
          todosJson: values.todosJson,
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
