import type { db as databaseClient } from "@acme/db/client";
import { and, eq } from "@acme/db";
import { TrainingUnitRun } from "@acme/db/schema";

import type {
  PassIndex,
  PersistedUnitRun,
  UnitPhase,
} from "../domain/training/education-unit/unit";
import { sql } from "@acme/db";

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
  difficultySnapshot: row.difficultySnapshotJson,
  scenarioSpec: row.scenarioSpecJson,
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
      difficultySnapshotJson: run.difficultySnapshot,
      scenarioSpecJson: run.scenarioSpec,
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
          difficultySnapshotJson: sql`coalesce(${TrainingUnitRun.difficultySnapshotJson}, excluded.difficulty_snapshot_json)`,
          // Replaceable, unlike difficulty (which is coalesced write-once): a
          // turn that produces a new spec overwrites; a turn that produces none
          // (null) preserves the stored one. So pass 2's connect replaces pass
          // 1's spec, but ordinary grill/solve turns never wipe it.
          scenarioSpecJson: sql`coalesce(excluded.scenario_spec_json, ${TrainingUnitRun.scenarioSpecJson})`,
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
