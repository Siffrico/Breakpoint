import assert from "node:assert/strict";
import { test } from "vitest";

import type { CurriculumNode } from "../types/training.types";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";
import { makeUnitContext } from "../education-unit/unit-context.fixture";
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
  unitContext: makeUnitContext({
    criterionId: "make-decision",
    criterion: "Make and defend the target decision.",
  }),
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

void test("settled feedback remains in the current unit with Next Unit locked", () => {
  const feedbackRun = {
    ...baseRun,
    mode: "awaiting_next_pass" as const,
  };

  assert.equal(
    isUnitAwaitingNextPass({ node: readyNode, run: feedbackRun }),
    true,
  );
  assert.equal(
    isUnitAwaitingAdvance({ node: readyNode, run: feedbackRun }),
    false,
  );
  assert.deepEqual(
    getUnitAdvanceGate({
      node: readyNode,
      run: feedbackRun,
      nextNode: null,
    }),
    { status: "locked" },
  );
  assert.equal(
    planWorkspaceTurn({
      activeUnit: readyNode,
      activeUnitResponses: [],
      activeUnitRun: feedbackRun,
      hasPersistedActiveUnitRun: true,
    })?.educationStage,
    "awaiting_next_pass",
  );
});

void test("a durable incomplete education run blocks recall without a phase response", () => {
  assert.deepEqual(
    planWorkspaceTurn({
      activeUnit: readyNode,
      activeUnitResponses: [],
      activeUnitRun: baseRun,
      hasPersistedActiveUnitRun: true,
      recallTarget: {
        unitNodeId: "recall-node",
        unitTitle: "Due recall",
      },
    }),
    {
      mode: "education_unit",
      promptKind: "education_unit",
      educationStage: "learning",
      interactionId: baseRun.cursor.interactionId,
      workflowId: `${baseRun.experience.id}@${baseRun.experience.version}`,
      activeUnitId: readyNode.id,
      activeUnitTitle: readyNode.title,
      recallUnitId: null,
      recallUnitTitle: null,
    },
  );
});

void test("a completed education run allows recall at the unit boundary", () => {
  const completedRun = { ...baseRun, mode: "complete" as const };

  assert.deepEqual(
    planWorkspaceTurn({
      activeUnit: readyNode,
      activeUnitResponses: [],
      activeUnitRun: completedRun,
      hasPersistedActiveUnitRun: true,
      recallTarget: {
        unitNodeId: "recall-node",
        unitTitle: "Due recall",
      },
    }),
    {
      mode: "education_unit",
      promptKind: "recall",
      educationStage: "review",
      interactionId: null,
      workflowId: null,
      activeUnitId: null,
      activeUnitTitle: null,
      recallUnitId: "recall-node",
      recallUnitTitle: "Due recall",
    },
  );
});
