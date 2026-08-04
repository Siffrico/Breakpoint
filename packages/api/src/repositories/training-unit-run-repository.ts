import type { db as databaseClient } from "@acme/db/client";
import type {
  UnitReviewChallenge,
  UnitRunKind,
  UnitTodo,
} from "@acme/validators";
import { and, desc, eq, isNull, ne, sql } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";
import {
  EducationExperienceSnapshotSchema,
  UnitCapabilityTodoSchema,
  UnitMasteryContractSchema,
  UnitReviewChallengeSchema,
  UnitReviewPassSchema,
  UnitRunKindSchema,
  UnitTodoSchema,
} from "@acme/validators";

import type { PersistedUnitRun } from "../domain/training/education-unit/unit-state";
import {
  passTodos,
  projectUnitRun,
} from "../domain/training/education-unit/unit-state";

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

/**
 * Rebuilds a todo list for a run persisted before the list existed. Only the
 * head has to be right — a resumed run needs to know what happens next, not
 * how it got here — so the tail is synthesized from the old mode fields.
 */
const hydrateLegacyTodos = ({
  row,
  kind,
}: {
  row: typeof TrainingUnitRun.$inferSelect;
  kind: UnitRunKind;
}): UnitTodo[] => {
  const capabilities = UnitCapabilityTodoSchema.array()
    .parse(row.capabilityTodosJson)
    .map((todo): UnitTodo => ({ kind: "capability", ...todo }));
  const pass = UnitReviewPassSchema.parse(row.reviewPass);
  const mode = row.mode === "awaiting_pass2" ? "awaiting_next_pass" : row.mode;
  const active = UnitReviewChallengeSchema.nullable().parse(
    row.activeReviewChallengeJson,
  );
  const pending = UnitReviewChallengeSchema.nullable().parse(
    row.pendingPass2ChallengeJson,
  );

  if (mode === "complete") {
    return [
      ...capabilities.map((todo) => ({ ...todo, status: "completed" as const })),
      ...passTodos(kind, pass).map((todo) => ({
        ...todo,
        status: "completed" as const,
      })),
    ];
  }
  if (mode === "learning") {
    return [...capabilities, ...passTodos(kind, pass)];
  }

  const done = capabilities.map((todo) => ({
    ...todo,
    status: "completed" as const,
  }));
  const openPass = mode === "awaiting_next_pass" ? pass + 1 : pass;
  const challenge = mode === "awaiting_next_pass" ? pending : active;
  return [
    ...done,
    ...passTodos(kind, openPass).map((todo) =>
      todo.kind === "solve"
        ? {
            ...todo,
            challenge,
            status:
              mode === "review" && active ? ("presented" as const) : todo.status,
          }
        : todo,
    ),
  ];
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
  const kind = UnitRunKindSchema.parse(row.kind);
  const parsed = UnitTodoSchema.array().safeParse(row.capabilityTodosJson);
  const todos = parsed.success
    ? parsed.data
    : hydrateLegacyTodos({ row, kind });

  const expectedIds = masteryContract.dimensions.map(
    (dimension) => dimension.id,
  );
  const persistedIds = todos
    .filter((todo) => todo.kind === "capability")
    .map((todo) => todo.dimensionId);
  if (
    expectedIds.length !== persistedIds.length ||
    expectedIds.some((id, index) => persistedIds[index] !== id)
  ) {
    throw new Error(
      "Unit run capability todos do not match its snapshotted mastery contract.",
    );
  }

  return projectUnitRun({
    unitId: row.unitContentId,
    sessionId: row.sessionId,
    userId: row.userId,
    kind,
    experience,
    masteryContract,
    todos,
    reviewerFeedback: row.reviewerFeedback,
    difficultySnapshot: row.difficultySnapshotJson,
  });
};

/** The unopened solve's parked challenge, if pre-generation has filled it. */
const pendingChallengeOf = (
  run: PersistedUnitRun,
): UnitReviewChallenge | null => {
  const pending = run.todos.find((todo) => todo.status !== "completed");
  return pending?.kind === "solve" && pending.status === "pending"
    ? pending.challenge
    : null;
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
        eq(TrainingUnitRun.kind, "education"),
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

  /**
   * Parks a backgrounded challenge on the run's unopened solve todo. Guarded on
   * the run still waiting with an empty slot and no live turn, so a task that
   * lands after the learner already pressed Enter (or after a second task won
   * the race) is a no-op rather than a challenge swap mid-pass.
   */
  setPendingPass2Challenge: async ({
    db,
    sessionId,
    unitContentId,
    kind,
    challenge,
  }: {
    db: Database;
    sessionId: string;
    unitContentId: string;
    kind: string;
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
    const run = mapUnitRun(row);
    const pending = run.todos.find((todo) => todo.status !== "completed");
    if (
      pending?.kind !== "solve" ||
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
      .set({
        capabilityTodosJson: todos,
        pendingPass2ChallengeJson: challenge,
      })
      .where(
        and(
          eq(TrainingUnitRun.sessionId, sessionId),
          eq(TrainingUnitRun.unitContentId, unitContentId),
          eq(TrainingUnitRun.kind, kind),
          eq(TrainingUnitRun.mode, run.mode),
          isNull(TrainingUnitRun.pendingPass2ChallengeJson),
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
      masteryContractJson: run.masteryContract,
      capabilityTodosJson: [...run.todos],
      // Projections of the todo list, written so existing reads and the
      // pre-generation guard keep working against plain columns.
      activeReviewChallengeJson: run.activeReviewChallenge,
      reviewerFeedback: run.reviewerFeedback,
      reviewPass: run.reviewPass,
      repairSpent: false,
      pendingPass2ChallengeJson: pendingChallengeOf(run),
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
          masteryContractJson: values.masteryContractJson,
          capabilityTodosJson: values.capabilityTodosJson,
          activeReviewChallengeJson: values.activeReviewChallengeJson,
          reviewerFeedback: values.reviewerFeedback,
          reviewPass: values.reviewPass,
          repairSpent: values.repairSpent,
          pendingPass2ChallengeJson: values.pendingPass2ChallengeJson,
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
