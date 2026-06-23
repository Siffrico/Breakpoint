import assert from "node:assert/strict";
import { test } from "vitest";

import { advanceUnitRun, IllegalUnitRunTransitionError } from "./orchestrator";
import { DIAGNOSTIC_FIRST_WORKFLOW } from "./workflow";

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
