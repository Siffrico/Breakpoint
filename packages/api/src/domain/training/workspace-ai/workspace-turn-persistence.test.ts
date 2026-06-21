import assert from "node:assert/strict";
import test from "node:test";

import type {
  CurriculumPlan,
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
  scenarioStage: "performance_evaluation",
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
      { round: 2, objection: "What else?", objective: "Consider alternatives." },
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
} satisfies UnitContent;

const plan = {
  id: "plan-1",
  title: "Plan",
  summary: "Plan summary",
  targetIdentity: "Expert operator",
  overview: null,
  beforeAfter: {
    headline: "Before/after",
    beforeSummary: "Before",
    afterSummary: "After",
    contrastPairs: [],
    firstShift: "Diagnose first.",
  },
  nodes: [
    {
      id: "node-1",
      parentNodeId: null,
      kind: "unit",
      title: "Diagnose workflow failure",
      summary: "Diagnose before fixing.",
      whyItMatters: "Wrong fixes waste attention.",
      learningGoal: "Use evidence to isolate the cause.",
      orderIndex: 0,
      depth: 0,
      positionColumn: 0,
      positionRow: 0,
      status: "ready",
    },
  ],
  nextUnitId: "node-1",
} satisfies CurriculumPlan;

const makeDeps = (calls: string[]): WorkspaceTurnPersistenceDependencies => ({
  appendMessage: async () => {
    calls.push("appendMessage");
    return {
      id: "message-1",
      sessionId: "session-1",
      role: "assistant",
      content: "Replacement scenario",
      sequence: 1,
      slot: "education_unit",
      unitId: "node-1",
      metadata: null,
      createdAt: new Date(),
    };
  },
  listMessages: async () => [],
  listPhaseResponsesBySession: async () => [],
  getPhaseResponses: async () => [],
  getUnitByNodeId: async () => unit,
  createUnitContent: async () => unit,
  savePhaseResponse: async () => {
    calls.push("savePhaseResponse");
    return {
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
    } satisfies PhaseResponseRecord;
  },
  updateUnitMasteryContract: async () => {
    calls.push("updateUnitMasteryContract");
    return {};
  },
  updateOpenScenarioContract: async () => {
    calls.push("updateOpenScenarioContract");
    return null;
  },
  saveAttempt: async () => {},
  completeNode: async () => {},
  touchSession: async () => {
    calls.push("touchSession");
  },
});

test("next-scenario persistence fails when the private contract cannot attach to an open scenario", async () => {
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
          nextStage: "performance_evaluation",
          unitComplete: false,
          score: null,
          strengths: [],
          improvements: [],
        },
        evaluationPlan: null,
        currentStage: "performance_evaluation",
        deps: makeDeps(calls),
      }),
    /open scenario|scenario contract/i,
  );

  assert.deepEqual(
    calls,
    ["appendMessage", "updateUnitMasteryContract", "updateOpenScenarioContract"],
    "the transcript/phase response should not advance after contract attachment fails",
  );
});
