import assert from "node:assert/strict";
import { test } from "vitest";

import type { UnitTurnResult } from "../education-unit/orchestrate-unit-turn";
import type { CurriculumPlan, UnitContent } from "../types/training.types";
import type { WorkspaceAiState } from "./types";
import type {
  WorkspaceEducationTurnCommit,
  WorkspaceTurnPersistenceDependencies,
} from "./workspace-turn-persistence";
import { saveUnitPhaseResult } from "./workspace-turn-persistence";

const unit = {
  id: "unit-content-1",
  nodeId: "node-1",
  title: "Diagnose workflow failure",
  summary: "Diagnose before fixing.",
  whyItMatters: "Wrong fixes waste the learner's scarce attention.",
  learningGoal: "Use evidence to isolate the cause.",
  seedPrompt: "What would you inspect first?",
  seedHint: "Name the move, reason, and signal.",
  clusterArcFrame: "Diagnose workflow failures.",
  clusterBriefing: null,
  complexityBudget: 1,
  buildContent: null,
  practicePrompts: null,
  teachbackSetup: {
    studentPersona: "Skeptical peer",
    openingMisconception: "The first visible symptom is the cause.",
    roundLadder: [
      { round: 1, objection: "Why?", objective: "Ground the diagnosis." },
      {
        round: 2,
        objection: "What else?",
        objective: "Consider alternatives.",
      },
      { round: 3, objection: "Now what?", objective: "Pick the next probe." },
    ],
    passSignals: ["Uses evidence.", "Names uncertainty."],
    failureModes: ["Guesses.", "Overfits the visible symptom."],
  },
  scenario: { title: "Workflow failure", focusAreas: ["diagnosis"] },
  unitMasteryContract: null,
  difficultyBands: null,
} satisfies UnitContent;

// No ready node -> planNextWorkspaceTurn resolves to null, exercising the
// fallback state path (unit just mastered, awaiting the Next-Unit gate).
const plan = {
  title: "Plan",
  summary: "Summary",
  targetIdentity: "Identity",
  nodes: [],
} as unknown as CurriculumPlan;

const state = {
  mode: "education_unit",
  promptKind: "education_unit",
  educationStage: "solve",
  workflowId: "education-unit-v1",
  activeUnitId: "node-1",
  activeUnitTitle: "Diagnose workflow failure",
  recallUnitId: null,
  recallUnitTitle: null,
} satisfies WorkspaceAiState;

const masteredTurn: UnitTurnResult = {
  assistantMessage: "That's a correct, well-explained solution.",
  event: { type: "solution_graded", passed: true },
  nextState: {
    unitId: "unit-content-1",
    recipeVersion: "education-unit-v1",
    phase: "mastered",
    pass: 2,
    connectGrills: 0,
    solveRepairs: 0,
  },
  forcedConnectAdvance: false,
  gradeReasoning: "Correct and clearly reasoned.",
  ratingWrite: { score: 90 },
};

void test("saveUnitPhaseResult persists transitions and non-grading continuations correctly", async () => {
  let captured: WorkspaceEducationTurnCommit | null = null;

  const deps = {
    getPhaseResponses: () => Promise.resolve([]),
    listPhaseResponsesBySession: () => Promise.resolve([]),
    listMessages: () => Promise.resolve([]),
    getUnitRun: () => Promise.resolve(null),
    upsertUnitRun: (run: unknown) => Promise.resolve(run),
    getUnitByNodeId: () => Promise.resolve(unit),
    createUnitContent: () => Promise.resolve(unit),
    commitEducationTurn: (input: WorkspaceEducationTurnCommit) => {
      captured = input;
      return Promise.resolve({
        assistantMessage: {
          id: "00000000-0000-0000-0000-000000000101",
          role: "assistant",
          content: input.assistantMessage.content,
          sequence: 1,
          slot: "education_unit",
          unitId: "node-1",
          metadata: null,
        },
        nextReadyNode: null,
      });
    },
    commitRecallTurn: () =>
      Promise.reject(new Error("commitRecallTurn should not be called")),
    commitNextScenarioPrompt: () =>
      Promise.reject(
        new Error("commitNextScenarioPrompt should not be called"),
      ),
    appendMessage: () => Promise.resolve(null),
    savePhaseResponse: () => Promise.resolve(null),
    updateUnitMasteryContract: () => Promise.resolve({}),
    updateScenarioContract: () => Promise.resolve(null),
    saveAttempt: () => Promise.resolve(),
    completeNode: () => Promise.resolve(null),
    touchSession: () => Promise.resolve(),
  } as unknown as WorkspaceTurnPersistenceDependencies;

  const ratingEvaluation = {
    scenarioAttemptId: "scenario-1",
    userId: "user-1",
    nodeId: "cluster-1",
    score: 90,
    errorCodes: [],
    wasOverTime: false,
    occurredAt: new Date(),
    bands: null,
  };

  const result = await saveUnitPhaseResult({
    sessionId: "session-1",
    userId: "user-1",
    message: "Here is my final solution.",
    state,
    unit,
    plan,
    turnResult: masteredTurn,
    ratingEvaluation,
    persistUserMessage: true,
    phaseResponseSequence: 0,
    turnId: "turn-1",
    turnLeaseId: "lease-1",
    deps,
  });

  assert.ok(captured, "commitEducationTurn should have been called");
  const commit = captured as unknown as WorkspaceEducationTurnCommit;
  assert.equal(commit.nextRun.phase, "mastered");
  assert.equal(commit.nextRun.pass, 2);
  assert.equal(commit.phaseResponse.metadata?.aiEducationStage, "mastered");
  assert.equal(commit.phaseResponse.passed, true);
  assert.equal(commit.phaseResponse.score, 90);
  assert.ok(commit.completion, "a mastered unit records a completion attempt");
  assert.equal(commit.completion.nodeId, "node-1");
  assert.equal(commit.ratingEvaluation, ratingEvaluation);
  assert.equal(commit.userMessage?.content, "Here is my final solution.");
  // No next runnable turn -> fallback state carries the mastered phase.
  assert.equal(result.state.educationStage, "mastered");

  captured = null;
  await saveUnitPhaseResult({
    sessionId: "session-1",
    userId: "user-1",
    message: "A message already appended before inference.",
    state,
    unit,
    plan,
    turnResult: masteredTurn,
    ratingEvaluation: null,
    persistUserMessage: false,
    phaseResponseSequence: 3,
    deps,
  });

  assert.ok(captured, "the non-claimed turn should still commit");
  const nonClaimedCommit = captured as unknown as WorkspaceEducationTurnCommit;
  assert.equal(nonClaimedCommit.userMessage, null);
  assert.equal(nonClaimedCommit.phaseResponse.sequence, 3);

  captured = null;
  const continuationTurn: UnitTurnResult = {
    assistantMessage:
      "Start by separating the symptom from its possible causes.",
    event: { type: "phase_continues", reason: "prompted" },
    nextState: {
      unitId: "unit-content-1",
      recipeVersion: "education-unit-v1",
      phase: "connect",
      pass: 1,
      connectGrills: 0,
      solveRepairs: 0,
    },
    forcedConnectAdvance: false,
    gradeReasoning: null,
    ratingWrite: null,
  };

  await saveUnitPhaseResult({
    sessionId: "session-1",
    userId: "user-1",
    message: "I am ready for the scenario.",
    state,
    unit,
    plan,
    turnResult: continuationTurn,
    ratingEvaluation: null,
    persistUserMessage: true,
    phaseResponseSequence: 4,
    turnId: "turn-2",
    turnLeaseId: "lease-2",
    deps,
  });

  assert.ok(captured, "the continuation turn should commit");
  const continuationCommit =
    captured as unknown as WorkspaceEducationTurnCommit;
  assert.equal(continuationCommit.nextRun.phase, "connect");
  assert.equal(continuationCommit.nextRun.connectGrills, 0);
  assert.equal(continuationCommit.phaseResponse.metadata?.verdict, "prompted");
  assert.equal(continuationCommit.phaseResponse.score, null);
  assert.equal(continuationCommit.ratingEvaluation, null);
  assert.equal(continuationCommit.completion, null);
});
