import assert from "node:assert/strict";
import { test } from "vitest";

import type { CurriculumNode } from "../types/training.types";
import type { UnitRun } from "./workflow";
import { advanceUnitRun, IllegalUnitRunTransitionError } from "./orchestrator";
import { DIAGNOSTIC_FIRST_WORKFLOW } from "./workflow";
import {
  assertUnitCanAdvance,
  getUnitAdvanceGate,
  isUnitAwaitingAdvance,
} from "./workspace-turn";

const baseRun = {
  sessionId: "session-1",
  unitContentId: "unit-1",
  userId: "user-1",
  workflowId: DIAGNOSTIC_FIRST_WORKFLOW.id,
  currentStepId: "diagnostic_scenario",
  stepScenarioCount: 0,
} as const;

void test("advanceUnitRun advances to the workflow next step when the current step completes", () => {
  const nextRun = advanceUnitRun({
    run: baseRun,
    outcome: {
      stepId: "diagnostic_scenario",
      requestedStepId: "concept_instruction",
      stepComplete: true,
      mastered: false,
      scenarioCompleted: false,
    },
    workflow: DIAGNOSTIC_FIRST_WORKFLOW,
  });

  assert.equal(nextRun.currentStepId, "concept_instruction");
  assert.equal(nextRun.stepScenarioCount, 0);
});

void test("advanceUnitRun sends mastery outcomes to the terminal step", () => {
  const nextRun = advanceUnitRun({
    run: {
      ...baseRun,
      currentStepId: "transfer_scenario",
      stepScenarioCount: 1,
    },
    outcome: {
      stepId: "transfer_scenario",
      requestedStepId: "completed",
      stepComplete: true,
      mastered: true,
      scenarioCompleted: true,
    },
    workflow: DIAGNOSTIC_FIRST_WORKFLOW,
  });

  assert.equal(nextRun.currentStepId, "completed");
  assert.equal(nextRun.stepScenarioCount, 2);
});

void test("advanceUnitRun allows explicit repair routes to workflow steps", () => {
  const nextRun = advanceUnitRun({
    run: {
      ...baseRun,
      currentStepId: "performance_evaluation",
      stepScenarioCount: 2,
    },
    outcome: {
      stepId: "performance_evaluation",
      requestedStepId: "concept_instruction",
      stepComplete: false,
      mastered: false,
      scenarioCompleted: true,
      repairStepId: "concept_instruction",
    },
    workflow: DIAGNOSTIC_FIRST_WORKFLOW,
  });

  assert.equal(nextRun.currentStepId, "concept_instruction");
  assert.equal(nextRun.stepScenarioCount, 0);
});

void test("advanceUnitRun rejects stale outcomes for a different current step", () => {
  assert.throws(
    () =>
      advanceUnitRun({
        run: baseRun,
        outcome: {
          stepId: "guided_application",
          requestedStepId: "performance_evaluation",
          stepComplete: true,
          mastered: false,
          scenarioCompleted: false,
        },
        workflow: DIAGNOSTIC_FIRST_WORKFLOW,
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
