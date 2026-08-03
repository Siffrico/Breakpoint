import assert from "node:assert/strict";
import { test } from "vitest";

import type { CurriculumNode } from "../types/training.types";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";
import { createUnitRun } from "../education-unit/unit-state";
import { planWorkspaceTurn } from "./orchestrator";
import {
  assertUnitCanAdvance,
  getUnitAdvanceGate,
  isUnitAwaitingAdvance,
  isUnitAwaitingNextPass,
} from "./workspace-turn";

const baseRun = createUnitRun({
  unitId: "unit-1",
  sessionId: "session-1",
  userId: "user-1",
  kind: "education",
  experience: DEFAULT_EDUCATION_EXPERIENCE,
  masteryContract: {
    version: 1,
    dimensions: [
      {
        id: "make-decision",
        name: "Make the decision",
        description: "Make and defend the target decision.",
        passSignals: ["Defends the decision"],
        failSignals: ["Guesses without evidence"],
        surrogateTraps: ["Uses vocabulary without reasoning"],
      },
    ],
  },
});

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
  const masteredRun = { ...baseRun, mode: "complete" as const };

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

void test("a settled Pass 1 remains in the current unit with Next Unit locked", () => {
  const awaitingPass2Run = {
    ...baseRun,
    mode: "awaiting_next_pass" as const,
  };

  assert.equal(
    isUnitAwaitingNextPass({ node: readyNode, run: awaitingPass2Run }),
    true,
  );
  assert.equal(
    isUnitAwaitingAdvance({ node: readyNode, run: awaitingPass2Run }),
    false,
  );
  assert.deepEqual(
    getUnitAdvanceGate({
      node: readyNode,
      run: awaitingPass2Run,
      nextNode: null,
    }),
    { status: "locked" },
  );
  assert.equal(
    planWorkspaceTurn({
      nodes: [readyNode],
      activeUnitResponses: [],
      activeUnitRun: awaitingPass2Run,
    })?.educationStage,
    "awaiting_next_pass",
  );
});
