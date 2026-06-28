import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod/v4";

import {
  ScenarioEvaluationContractSchema,
  WorkspaceEducationStageSchema,
} from "@acme/validators";

import { getStepCard } from "./stage-runtime";
import { WorkspaceAiEducationOutputSchema } from "./types";
import { passesUnitCompletionGate } from "./workflow";

const educationState = {
  mode: "education_unit",
  promptKind: "education_unit",
  educationStage: "Test",
  workflowId: "verdict-rulebook-v1",
  activeUnitId: "00000000-0000-0000-0000-000000000001",
  activeUnitTitle: "Transfer",
  recallUnitId: null,
  recallUnitTitle: null,
} as const;

void test("Test uses the education runtime to generate a transfer scenario", () => {
  const runtime = getStepCard(educationState);

  assert.equal(runtime.promptKind, "education_unit");
  assert.equal(runtime.modelPurpose, "education");
  assert.equal(runtime.contextMode, "teacher");
  assert.equal(runtime.contextMove, "transfer");
  assert.equal(runtime.outputSchema, WorkspaceAiEducationOutputSchema);
});

void test("legacy workspace stages normalize at the shared validation boundary", () => {
  assert.equal(
    WorkspaceEducationStageSchema.parse("performance_evaluation"),
    "Review",
  );

  const contract = ScenarioEvaluationContractSchema.parse({
    version: 1,
    scenarioStage: "transfer_scenario",
    scenarioPromptSummary: "Apply the mechanism in a new context.",
    testedDimensions: [
      {
        dimensionId: "transfer-skill",
        promptRole: "Tests transfer.",
        expectedStrongMoves: ["Uses the mechanism."],
        acceptableVariants: [],
        commonWrongMoves: ["Matches surface details."],
        scoreBands: {
          strong: "Transfers the mechanism.",
          partial: "Transfers part of the mechanism.",
          weak: "Does not transfer the mechanism.",
        },
      },
    ],
    learnerVisibleCriteria: ["Use the underlying mechanism."],
    evaluatorNotes: [],
  });

  assert.equal(contract.scenarioStage, "Test");
  assert.doesNotThrow(() => z.toJSONSchema(ScenarioEvaluationContractSchema));
});

void test("a unit completes on a passing, complete final check alone", () => {
  assert.equal(
    passesUnitCompletionGate({
      stepId: "Check",
      verdict: "pass",
      evaluationComplete: true,
    }),
    true,
  );
  assert.equal(
    passesUnitCompletionGate({
      stepId: "Review",
      verdict: "pass",
      evaluationComplete: true,
    }),
    false,
  );
  assert.equal(
    passesUnitCompletionGate({
      stepId: "Check",
      verdict: "retry",
      evaluationComplete: true,
    }),
    false,
  );
  assert.equal(
    passesUnitCompletionGate({
      stepId: "Check",
      verdict: "pass",
      evaluationComplete: false,
    }),
    false,
  );
});
