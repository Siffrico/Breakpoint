import assert from "node:assert/strict";
import test from "node:test";

import { WorkspaceAiEvaluationOutputSchema } from "./types";
import { validateEvaluationDimensionResults } from "./evaluation-contracts";

test("contract-aware evaluation output requires per-dimension results", () => {
  const result = WorkspaceAiEvaluationOutputSchema.safeParse({
    assistantMessage: "Feedback",
    estimatedItemRating: 1200,
    stageComplete: false,
    nextStage: "performance_evaluation",
    unitComplete: false,
    score: 60,
    strengths: ["Names one relevant move."],
    improvements: ["Score against the stored private rubric."],
    evaluationPlan: {
      mode: "standard",
      scenarioCount: 1,
      timeLimitSeconds: 300,
      feedbackMode: "full_after_each",
      reason: "Single scenario.",
    },
    routingDecision: "retry",
    evaluationSummary: "Partial answer.",
    evidenceCitations: ["The learner named one move."],
    failedDimensions: ["diagnose-cause"],
  });

  assert.equal(
    result.success,
    false,
    "evaluations that rely on a private scenario contract should not be schema-valid without dimensionResults",
  );
});

test("contract dimension validation rejects omitted tested dimensions", () => {
  assert.throws(
    () =>
      validateEvaluationDimensionResults({
        scenarioContract: {
          version: 1,
          scenarioStage: "performance_evaluation",
          scenarioPromptSummary: "Diagnose the failing workflow.",
          testedDimensions: [
            {
              dimensionId: "diagnose-cause",
              promptRole: "Find the causal issue.",
              expectedStrongMoves: ["Names the causal chain."],
              acceptableVariants: [],
              commonWrongMoves: ["Jumps to a fix."],
              scoreBands: {
                strong: "Causal and evidence-backed.",
                partial: "Some causal evidence.",
                weak: "Generic.",
              },
            },
            {
              dimensionId: "choose-probe",
              promptRole: "Choose the next evidence-gathering move.",
              expectedStrongMoves: ["Picks a discriminating probe."],
              acceptableVariants: [],
              commonWrongMoves: ["Runs a broad unfocused check."],
              scoreBands: {
                strong: "Probe distinguishes live hypotheses.",
                partial: "Probe gives some signal.",
                weak: "Probe does not reduce uncertainty.",
              },
            },
          ],
          learnerVisibleCriteria: ["Use evidence."],
          evaluatorNotes: [],
        },
        dimensionIds: ["diagnose-cause"],
      }),
    /omitted scenario dimension/i,
  );
});
