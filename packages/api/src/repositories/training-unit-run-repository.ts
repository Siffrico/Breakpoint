import type { db as databaseClient } from "@acme/db/client";
import { and, eq } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";

import type {
  PassIndex,
  PersistedUnitRun,
  UnitPhase,
} from "../domain/training/education-unit/unit";

type Database = typeof databaseClient;

// Narrow the free-text varchar columns back onto the FSM's literal unions. A
// row that predates the FSM (or was hand-edited) is a corrupt cursor, not a
// recoverable state, so we fail loudly rather than silently coercing.
const UNIT_PHASES: readonly UnitPhase[] = [
  "orient",
  "connect",
  "solve",
  "teach",
  "mastered",
];

const parsePhase = (value: string): UnitPhase => {
  if ((UNIT_PHASES as readonly string[]).includes(value)) {
    return value as UnitPhase;
  }
  throw new Error(`Unit run has an unknown phase: "${value}".`);
};

const parsePass = (value: number): PassIndex => {
  if (value === 1 || value === 2) {
    return value;
  }
  throw new Error(`Unit run has an invalid pass: ${value}.`);
};

const mapUnitRun = (
  row: typeof TrainingUnitRun.$inferSelect,
): PersistedUnitRun => ({
  unitId: row.unitContentId,
  sessionId: row.sessionId,
  userId: row.userId,
  recipeVersion: row.recipeVersion,
  phase: parsePhase(row.phase),
  pass: parsePass(row.pass),
  connectGrills: row.connectGrills,
  solveRepairs: row.solveRepairs,
});

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
      userId: run.userId ?? null,
      recipeVersion: run.recipeVersion,
      phase: run.phase,
      pass: run.pass,
      connectGrills: run.connectGrills,
      solveRepairs: run.solveRepairs,
    };

    const [row] = await db
      .insert(TrainingUnitRun)
      .values(values)
      .onConflictDoUpdate({
        target: [TrainingUnitRun.sessionId, TrainingUnitRun.unitContentId],
        set: {
          userId: values.userId,
          recipeVersion: values.recipeVersion,
          phase: values.phase,
          pass: values.pass,
          connectGrills: values.connectGrills,
          solveRepairs: values.solveRepairs,
        },
      })
      .returning();

    if (!row) {
      throw new Error("Unit run could not be saved.");
    }

    return mapUnitRun(row);
  },
};
