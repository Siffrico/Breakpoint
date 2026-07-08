import assert from "node:assert/strict";
import { test } from "vitest";

import type { CurriculumNode } from "../types/training.types";
import type { PersistedUnitRun } from "../education-unit/unit";
import {
  assertUnitCanAdvance,
  getUnitAdvanceGate,
  isUnitAwaitingAdvance,
} from "./workspace-turn";

const baseRun = {
  unitId: "unit-1",
  sessionId: "session-1",
  userId: "user-1",
  recipeVersion: "education-unit-v1",
  phase: "connect",
  pass: 1,
  connectGrills: 0,
  solveRepairs: 0,
  scenarioSpec: null,
  difficultySnapshot: null,
} satisfies PersistedUnitRun;

const readyNode = {
  id: "node-1",
  parentNodeId: null,
  kind: "unit",
  title: "Current unit",
  summary: "Summary",
  whyItMatters: "Why it matters",
  learningGoal: "Goal",
  orderIndex: 1,
  depth: 1,
  positionColumn: 0,
  positionRow: 1,
  status: "ready",
  difficultyBands: null,
} satisfies CurriculumNode;

void test("unit advance gate is enabled only after the unit is mastered while node remains ready", () => {
  const masteredRun = {
    ...baseRun,
    phase: "mastered",
    pass: 2,
  } satisfies PersistedUnitRun;

  assert.equal(isUnitAwaitingAdvance({ node: readyNode, run: baseRun }), false);
  assert.equal(
    isUnitAwaitingAdvance({ node: readyNode, run: masteredRun }),
    true,
  );
  assert.deepEqual(
    getUnitAdvanceGate({
      node: readyNode,
      run: masteredRun,
      nextNode: { ...readyNode, id: "node-2", title: "Next unit" },
    }),
    {
      status: "enabled",
      unitId: "node-1",
      nextTitle: "Next unit",
    },
  );
});

void test("unit advance assertion rejects unmastered runs and accepts idempotent completed nodes", () => {
  assert.throws(
    () => assertUnitCanAdvance({ node: readyNode, run: baseRun }),
    /not complete yet/,
  );

  assert.doesNotThrow(() =>
    assertUnitCanAdvance({
      node: { ...readyNode, status: "completed" },
      run: baseRun,
    }),
  );
});
