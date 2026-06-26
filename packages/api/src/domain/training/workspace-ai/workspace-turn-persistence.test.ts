import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  PhaseResponseRecord,
  ScenarioEvaluationContract,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceTurnPersistenceDependencies } from "./workspace-turn-persistence";
import { saveNextScenarioPrompt } from "./workspace-turn-persistence";

const unitMasteryContract = {
  version: 1,
  dimensions: [
    {
      id: "diagnose-cause",
      name: "Diagnose cause",
      description: "Find the cause before choosing a remedy.",
      passSignals: ["Uses scenario evidence."],
      failSignals: ["Guesses from labels."],
      surrogateTraps: ["Generic advice."],
    },
  ],
} satisfies NonNullable<UnitContent["unitMasteryContract"]>;

const scenarioEvaluationContract = {
  version: 1,
  scenarioStage: "Review",
  scenarioPromptSummary: "Diagnose the failing workflow.",
  testedDimensions: [
    {
      dimensionId: "diagnose-cause",
      promptRole: "Tests diagnosis under ambiguity.",
      expectedStrongMoves: ["Separates symptom from cause."],
      acceptableVariants: ["Names uncertainty explicitly."],
      commonWrongMoves: ["Jumps to a fix."],
      scoreBands: {
        strong: "Evidence-backed diagnosis.",
        partial: "Some evidence, incomplete causal chain.",
        weak: "Generic fix without diagnosis.",
      },
    },
  ],
  learnerVisibleCriteria: ["Use the scenario evidence."],
  evaluatorNotes: ["Private rubric."],
} satisfies ScenarioEvaluationContract;

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
  scenario: {
    title: "Workflow failure",
    focusAreas: ["diagnosis"],
  },
  unitMasteryContract,
  difficultyBands: [
    { order: 0, minRating: 900, maxRating: 1100, label: "Supported diagnosis" },
    { order: 1, minRating: 1100, maxRating: 1300, label: "Messy diagnosis" },
    { order: 2, minRating: 1300, maxRating: 1500, label: "Transfer diagnosis" },
  ],
} satisfies UnitContent;

const makeDeps = (calls: string[]): WorkspaceTurnPersistenceDependencies => ({
  appendMessage: () => {
    calls.push("appendMessage");
    return Promise.resolve({
      id: "message-1",
      sessionId: "session-1",
      role: "assistant",
      content: "Replacement scenario",
      sequence: 1,
      slot: "education_unit",
      unitId: "node-1",
      metadata: null,
      createdAt: new Date(),
    });
  },
  listMessages: () => Promise.resolve([]),
  listPhaseResponsesBySession: () => Promise.resolve([]),
  getPhaseResponses: () => {
    calls.push("getPhaseResponses");
    return Promise.resolve([]);
  },
  getUnitRun: () => Promise.resolve(null),
  upsertUnitRun: (run) => Promise.resolve(run),
  getUnitByNodeId: () => Promise.resolve(unit),
  createUnitContent: () => Promise.resolve(unit),
  savePhaseResponse: () => {
    calls.push("savePhaseResponse");
    return Promise.resolve({
      id: "response-1",
      unitContentId: "unit-content-1",
      sessionId: "session-1",
      userId: "user-1",
      phase: "ai_education",
      sequence: 0,
      userResponse: "[next_scenario_requested]",
      aiResponse: "Replacement scenario",
      passed: null,
      score: null,
      metadata: null,
      createdAt: new Date(),
    } satisfies PhaseResponseRecord);
  },
  updateUnitMasteryContract: () => {
    calls.push("updateUnitMasteryContract");
    return Promise.resolve({});
  },
  updateOpenScenarioContract: () => {
    calls.push("updateOpenScenarioContract");
    return Promise.resolve(null);
  },
  saveAttempt: () => Promise.resolve(),
  completeNode: () => Promise.resolve(null),
  commitEducationTurn: () => {
    calls.push("commitEducationTurn");
    return Promise.resolve({
      assistantMessage: {
        id: "00000000-0000-0000-0000-000000000101",
        role: "assistant",
        content: "Saved",
        sequence: 1,
        slot: "education_unit",
        unitId: "node-1",
        metadata: null,
      },
      nextReadyNode: null,
    });
  },
  commitNextScenarioPrompt: (input) => {
    calls.push("commitNextScenarioPrompt");
    assert.equal(
      input.contracts?.openScenarioContract?.scenarioPrompt,
      "Replacement scenario",
    );
    throw new Error(
      "Scenario evaluation contract could not be attached to an open scenario.",
    );
  },
  touchSession: () => {
    calls.push("touchSession");
    return Promise.resolve();
  },
});

void test("next-scenario persistence fails when the private contract cannot attach to an open scenario", async () => {
  const calls: string[] = [];

  await assert.rejects(
    () =>
      saveNextScenarioPrompt({
        sessionId: "session-1",
        userId: "user-1",
        unit,
        output: {
          assistantMessage: "Replacement scenario",
          unitMasteryContract,
          scenarioEvaluationContract,
          estimatedItemRating: 1200,
          stageComplete: false,
          reviewQuality: "retry",
          unitComplete: false,
          score: null,
          strengths: [],
          improvements: [],
        },
        evaluationPlan: null,
        currentStage: "Review",
        deps: makeDeps(calls),
      }),
    /open scenario|scenario contract/i,
  );

  assert.deepEqual(
    calls,
    ["getPhaseResponses", "commitNextScenarioPrompt"],
    "scenario replacement should be handed to the atomic commit boundary",
  );
});
