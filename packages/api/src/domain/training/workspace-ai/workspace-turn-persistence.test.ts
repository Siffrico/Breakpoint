import assert from "node:assert/strict";
import { Effect } from "effect";
import { test, vi } from "vitest";

import type { UnitTurnResult } from "../education-unit/orchestrate-unit-turn";
import type { CurriculumPlan, UnitContent } from "../types/training.types";
import type { WorkspaceAiState } from "./types";
import type {
  WorkspaceEducationTurnCommit,
  WorkspaceTurnPersistenceDependencies,
} from "./workspace-turn-persistence";
import { saveUnitPhaseResult } from "./workspace-turn-persistence";
import { WorkspaceTurnRepo } from "./workspace-turn-repo";

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
  event: { type: "solution_graded", passed: true, score: 90, errorCodes: [] },
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
  ratingWrite: { score: 90, errorCodes: [] },
  syllabusCheckOff: null,
  scenarioSpec: null,
};

const difficultySnapshot = {
  nodeId: "cluster-1",
  directive: {
    intent: "probe" as const,
    bandOrder: 0,
    supportLevel: "guided" as const,
    targetItemRating: 1100,
    targetMisconceptionCode: null,
    reason: "Calibrated probe",
    nextProgress: { bandOrder: 0, supportLevel: "guided" as const },
  },
  promptBlock: "Keep the scenario at rating 1100.",
  ratingSnapshot: "1100 ±200",
  learnerRating: 1100,
};

void test("saveUnitPhaseResult persists transitions and non-grading continuations correctly", async () => {
  let captured: WorkspaceEducationTurnCommit | null = null;
  const legacyDirectRunWrite = vi.fn((run: unknown) => Promise.resolve(run));
  const commitEducationTurn = vi.fn((input: WorkspaceEducationTurnCommit) => {
    captured = input;
    return Promise.resolve({
      assistantMessage: {
        id: "00000000-0000-0000-0000-000000000101",
        role: "assistant" as const,
        content: input.assistantMessage.content,
        sequence: 1,
        slot: "education_unit" as const,
        unitId: "node-1",
        metadata: null,
      },
    });
  });

  const deps = {
    getPhaseResponses: () => Promise.resolve([]),
    listPhaseResponsesBySession: () => Promise.resolve([]),
    listMessages: () => Promise.resolve([]),
    getUnitRun: () => Promise.resolve(null),
    getInFlightRecallRun: () => Promise.resolve(null),
    upsertUnitRun: legacyDirectRunWrite,
    getUnitByNodeId: () => Promise.resolve(unit),
    listRecallCandidates: () => Promise.resolve([]),
    commitEducationTurn,
    appendMessage: () => Promise.resolve(null),
  } as unknown as WorkspaceTurnPersistenceDependencies;

  const runSave = (input: Parameters<typeof saveUnitPhaseResult>[0]) =>
    Effect.runPromise(
      saveUnitPhaseResult(input).pipe(
        Effect.provideService(WorkspaceTurnRepo, {
          commitEducationTurn: (commit) =>
            Effect.promise(() => commitEducationTurn(commit)),
        }),
      ),
    );

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

  const result = await runSave({
    sessionId: "session-1",
    userId: "user-1",
    message: "Here is my final solution.",
    state,
    unit,
    plan,
    turnResult: masteredTurn,
    ratingEvaluation,
    difficultySnapshot,
    scenarioAttemptId: "scenario-1",
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
  assert.equal(commitEducationTurn.mock.calls.length, 1);
  assert.equal(legacyDirectRunWrite.mock.calls.length, 0);
  // No next runnable turn -> fallback state carries the mastered phase.
  assert.equal(result.state.educationStage, "mastered");

  captured = null;
  await runSave({
    sessionId: "session-1",
    userId: "user-1",
    message: "A message already appended before inference.",
    state,
    unit,
    plan,
    turnResult: masteredTurn,
    ratingEvaluation: null,
    difficultySnapshot,
    scenarioAttemptId: "scenario-1",
    persistUserMessage: false,
    phaseResponseSequence: 3,
    turnId: "turn-2",
    turnLeaseId: "lease-2",
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
    syllabusCheckOff: null,
    scenarioSpec: null,
  };

  await runSave({
    sessionId: "session-1",
    userId: "user-1",
    message: "I am ready for the scenario.",
    state,
    unit,
    plan,
    turnResult: continuationTurn,
    ratingEvaluation: null,
    difficultySnapshot,
    scenarioAttemptId: null,
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

  captured = null;
  await runSave({
    sessionId: "session-1",
    userId: "user-1",
    message: "Present the transfer scenario.",
    state,
    unit,
    plan,
    turnResult: {
      ...continuationTurn,
      nextState: { ...continuationTurn.nextState, pass: 2 },
    },
    ratingEvaluation: null,
    difficultySnapshot,
    scenarioAttemptId: null,
    persistUserMessage: true,
    phaseResponseSequence: 5,
    turnId: "turn-3",
    turnLeaseId: "lease-3",
    deps,
  });

  assert.ok(captured);
  const presentationCommit =
    captured as unknown as WorkspaceEducationTurnCommit;
  assert.equal(
    presentationCommit.scenarioPresentation?.snapshot,
    difficultySnapshot,
  );
  assert.equal(presentationCommit.solvePresentation, null);

  captured = null;
  await runSave({
    sessionId: "session-1",
    userId: "user-1",
    message: "Here is my pass-1 solution.",
    state,
    unit,
    plan,
    turnResult: {
      ...continuationTurn,
      assistantMessage:
        "That works. Now explain why the same mechanism applies here.",
      event: { type: "teach_done" },
      nextState: { ...continuationTurn.nextState, pass: 2 },
      scenarioSpec: {
        targetSkill: "Separate correlation from causation",
        surface: "A flaky churn dashboard",
        canonicalAnswer: "Demand a discriminating prediction.",
        reasoningPath: "Compare the hypotheses' predictions.",
        rubric: "Names an observable that distinguishes the hypotheses.",
        pass: 2,
      },
    },
    ratingEvaluation: null,
    difficultySnapshot,
    scenarioAttemptId: null,
    persistUserMessage: true,
    phaseResponseSequence: 6,
    turnId: "turn-4",
    turnLeaseId: "lease-4",
    deps,
  });

  assert.ok(captured);
  const teachProbeCommit = captured as unknown as WorkspaceEducationTurnCommit;
  assert.equal(teachProbeCommit.phaseResponse.metadata?.verdict, "teach_done");
  assert.equal(
    teachProbeCommit.scenarioPresentation?.snapshot,
    difficultySnapshot,
  );
  assert.equal(teachProbeCommit.nextRun.scenarioSpec?.pass, 2);
});
