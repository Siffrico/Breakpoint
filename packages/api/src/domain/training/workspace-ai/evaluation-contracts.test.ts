import assert from "node:assert/strict";
import test from "node:test";

import { ScenarioEvaluationContractSchema } from "@acme/validators";

import { renderWorkspaceStageContextPrompt } from "../context-engine/render-context-prompt";
import type { WorkspaceContextEnvelope } from "../context-engine/schemas";
import type { WorkspaceTurnRuntime } from "./stage-runtime";
import { validateEvaluationDimensionResults } from "./evaluation-contracts";
import { WorkspaceAiEvaluationOutputSchema } from "./types";

const verifierRubricAudit = {
  answerIntegrity: "PASS - the contract has a definite solution.",
  wellPosed: "PASS - the task has one interpretation.",
  selfContained: "PASS - all facts are in the scenario.",
  conceptRequired: "PASS - removing diagnosis changes the answer.",
  shortcutsClosed: "PASS - jumping to a fix misses the causal evidence.",
  difficulty: "PASS - calibrated to the target item rating.",
  spark: "PASS - the key insight is distinguishing symptom from cause.",
};

void test("contract-aware evaluation output requires per-dimension results", () => {
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

void test("contract dimension validation rejects omitted tested dimensions", () => {
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

void test("scenario verifier accepts private answer and intended solution", () => {
  const result = ScenarioEvaluationContractSchema.safeParse({
    version: 1,
    scenarioStage: "performance_evaluation",
    scenarioPromptSummary: "Diagnose the failing workflow.",
    testedDimensions: [
      {
        dimensionId: "diagnose-cause",
        promptRole: "Find the causal issue.",
        expectedStrongMoves: ["Names the causal chain."],
        acceptableVariants: ["States uncertainty and the discriminating test."],
        commonWrongMoves: ["Jumps to a fix."],
        scoreBands: {
          strong: "Causal and evidence-backed.",
          partial: "Some causal evidence.",
          weak: "Generic.",
        },
      },
    ],
    learnerVisibleCriteria: ["Use the scenario evidence."],
    evaluatorNotes: ["Private rubric."],
    verifier: {
      type: "fixed_answer",
      answer: "The batch job is retrying stale records because the checkpoint is written after the side effect.",
      checkerSpec: null,
      intendedSolution:
        "Notice that duplicate side effects happen only after worker restarts, then identify checkpoint ordering as the causal mechanism.",
      shortcutFailures: [
        "Increasing worker count makes duplicate side effects more likely.",
        "Adding a generic retry wrapper preserves the stale checkpoint bug.",
      ],
      rubricAudit: verifierRubricAudit,
    },
  });

  assert.equal(result.success, true);
});

void test("scenario verifier rejects checker contracts without a checker spec", () => {
  const result = ScenarioEvaluationContractSchema.safeParse({
    version: 1,
    scenarioStage: "performance_evaluation",
    scenarioPromptSummary: "Choose a valid migration plan.",
    testedDimensions: [
      {
        dimensionId: "choose-plan",
        promptRole: "Choose a safe migration plan.",
        expectedStrongMoves: ["Preserves writes during rollout."],
        acceptableVariants: [],
        commonWrongMoves: ["Runs an irreversible migration first."],
        scoreBands: {
          strong: "Valid rollout plan.",
          partial: "Partially safe.",
          weak: "Unsafe.",
        },
      },
    ],
    learnerVisibleCriteria: ["Preserve writes."],
    evaluatorNotes: [],
    verifier: {
      type: "checker",
      answer: null,
      checkerSpec: null,
      intendedSolution:
        "Any valid solution must keep old and new writers compatible until reads have moved.",
      shortcutFailures: ["A one-step migration risks data loss."],
      rubricAudit: verifierRubricAudit,
    },
  });

  assert.equal(result.success, false);
});

void test("evaluator context renders private verifier contract", () => {
  const scenarioEvaluationContract = ScenarioEvaluationContractSchema.parse({
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
    ],
    learnerVisibleCriteria: ["Use the scenario evidence."],
    evaluatorNotes: ["Private rubric."],
    verifier: {
      type: "fixed_answer",
      answer: "The checkpoint is written after the side effect.",
      checkerSpec: null,
      intendedSolution:
        "Trace the restart path and find that the side effect can repeat before the checkpoint advances.",
      shortcutFailures: ["More retries make the duplicate effect worse."],
      rubricAudit: verifierRubricAudit,
    },
  });
  const envelope = {
    learner: {
      targetIdentity: "Workflow debugger",
      durableMemory: [],
      recurringFailurePatterns: [],
      preferences: [],
      ratingSnapshot: "1200 +/-80, Band 2, trend: active",
      progressSummary: null,
    },
    curriculum: {
      title: "Debug production workflows",
      summary: "Diagnose realistic failures.",
      currentUnitIndex: 2,
      totalUnits: 5,
    },
    unit: {
      id: "unit-1",
      title: "Diagnose before fixing",
      learningGoal: "Use evidence to isolate the cause.",
      summary: "Find cause before remedy.",
      whyItMatters: "Wrong fixes waste time.",
      seedScenario: "What would you inspect first?",
      focusAreas: ["diagnosis"],
    },
    state: {
      mode: "education_unit",
      educationStage: "performance_evaluation",
      retryCount: 0,
    },
    evidence: {
      latestLearnerMessage: "I would increase retries.",
      recentTranscript: ["Assistant: Diagnose the workflow."],
      mostRelevantFailure: null,
      strongestPriorSuccess: null,
      unresolvedPattern: null,
    },
    promptShownToLearner: null,
    evaluationPlan: null,
    attemptTiming: null,
    scenarioEvaluationContract,
    difficultyDirective: null,
    outputContract: {
      move: "evaluate",
      maxWords: 180,
      mustDo: ["Judge against the contract."],
      mustNotDo: ["Do not expose private answers."],
    },
  } satisfies WorkspaceContextEnvelope;
  const runtime = {
    mode: "education_unit",
    stage: "performance_evaluation",
    promptKind: "evaluate_feedback",
    modelPurpose: "evaluation",
    contextMode: "evaluator",
    contextMove: "evaluate",
    outputSchema: WorkspaceAiEvaluationOutputSchema,
  } satisfies WorkspaceTurnRuntime;

  const prompt = renderWorkspaceStageContextPrompt({ envelope, runtime });

  assert.match(prompt, /Private scenario evaluation contract/);
  assert.match(prompt, /The checkpoint is written after the side effect/);
  assert.match(prompt, /shortcutFailures/);
});
