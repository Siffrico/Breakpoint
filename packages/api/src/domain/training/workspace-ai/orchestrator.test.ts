import assert from "node:assert/strict";
import { test } from "vitest";

import type { CurriculumNode } from "../types/training.types";
import type { UnitRun } from "./workflow";
import { advanceUnitRun, IllegalUnitRunTransitionError } from "./orchestrator";
import { VERDICT_RULEBOOK_WORKFLOW_ID } from "./workflow";
import {
  assertUnitCanAdvance,
  getUnitAdvanceGate,
  isUnitAwaitingAdvance,
} from "./workspace-turn";

const baseRun = {
  sessionId: "session-1",
  unitContentId: "unit-1",
  userId: "user-1",
  workflowId: VERDICT_RULEBOOK_WORKFLOW_ID,
  currentStepId: "Diagnose",
  stepScenarioCount: 0,
} as const;

void test("advanceUnitRun advances by verdict rule", () => {
  const nextRun = advanceUnitRun({
    run: baseRun,
    outcome: {
      stepId: "Diagnose",
      verdict: "enough",
      mastered: false,
      scenarioCompleted: false,
      retryCount: 0,
    },
  });

  assert.equal(nextRun.currentStepId, "BreakDown");
  assert.equal(nextRun.stepScenarioCount, 0);
});

void test("advanceUnitRun sends mastery outcomes to the terminal step", () => {
  const nextRun = advanceUnitRun({
    run: {
      ...baseRun,
      currentStepId: "Check",
      stepScenarioCount: 1,
    },
    outcome: {
      stepId: "Check",
      verdict: "pass",
      mastered: true,
      scenarioCompleted: true,
      retryCount: 0,
    },
  });

  assert.equal(nextRun.currentStepId, "completed");
  assert.equal(nextRun.stepScenarioCount, 2);
});

void test("advanceUnitRun sends a passing final check back to transfer when the rating gate is not met", () => {
  const nextRun = advanceUnitRun({
    run: {
      ...baseRun,
      currentStepId: "Check",
      stepScenarioCount: 1,
    },
    outcome: {
      stepId: "Check",
      verdict: "pass",
      mastered: false,
      scenarioCompleted: true,
      retryCount: 0,
    },
  });

  assert.equal(nextRun.currentStepId, "Test");
  assert.equal(nextRun.stepScenarioCount, 0);
});

void test("advanceUnitRun rejects mastery before the final check", () => {
  assert.throws(
    () =>
      advanceUnitRun({
        run: { ...baseRun, currentStepId: "Review" },
        outcome: {
          stepId: "Review",
          verdict: "pass",
          mastered: true,
          scenarioCompleted: true,
          retryCount: 0,
        },
      }),
    /only a passing final check/i,
  );
});

void test("advanceUnitRun allows repair verdict routes", () => {
  const nextRun = advanceUnitRun({
    run: {
      ...baseRun,
      currentStepId: "Review",
      stepScenarioCount: 2,
    },
    outcome: {
      stepId: "Review",
      verdict: "repair",
      mastered: false,
      scenarioCompleted: true,
      retryCount: 0,
    },
  });

  assert.equal(nextRun.currentStepId, "TeachGap");
  assert.equal(nextRun.stepScenarioCount, 0);
});

void test("advanceUnitRun rejects stale outcomes for a different current step", () => {
  assert.throws(
    () =>
      advanceUnitRun({
        run: baseRun,
        outcome: {
          stepId: "Solve",
          verdict: "attempted",
          mastered: false,
          scenarioCompleted: false,
          retryCount: 0,
        },
      }),
    IllegalUnitRunTransitionError,
  );
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

void test("unit advance gate is enabled only after run completion while node remains ready", () => {
  const completedRun = {
    ...baseRun,
    currentStepId: "completed",
  } satisfies UnitRun;

  assert.equal(
    isUnitAwaitingAdvance({ node: readyNode, run: completedRun }),
    true,
  );
  assert.deepEqual(
    getUnitAdvanceGate({
      node: readyNode,
      run: completedRun,
      nextNode: { ...readyNode, id: "node-2", title: "Next unit" },
    }),
    {
      status: "enabled",
      unitId: "node-1",
      nextTitle: "Next unit",
    },
  );
});

void test("unit advance assertion rejects incomplete runs and accepts idempotent completed nodes", () => {
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
