import assert from "node:assert/strict";
import { test } from "vitest";

import type { PersistedUnitRun } from "../education-unit/unit";
import type { CurriculumNode, UnitContent } from "../types/training.types";
import type { WorkspaceAiState } from "./types";
import type { ResolvedWorkspaceTurn } from "./workspace-turn";
import type { WorkspaceTurnOrchestrationDependencies } from "./workspace-turn-orchestration";
import { EducationUnitContractError } from "../education-unit/orchestrate-unit-turn";
import { runEducationUnitTurn } from "./workspace-turn-orchestration";

const fail = (name: string): never => {
  throw new Error(`${name} should not be called`);
};

const node = {
  id: "node-1",
  parentNodeId: "cluster-1",
  kind: "unit",
  title: "Unit",
  summary: "Summary",
  whyItMatters: "Why",
  learningGoal: "Goal",
  orderIndex: 1,
  depth: 1,
  positionColumn: 0,
  positionRow: 1,
  status: "ready",
  difficultyBands: null,
} satisfies CurriculumNode;

const clusterNode = {
  id: "cluster-1",
  parentNodeId: null,
  kind: "skill_cluster",
  title: "Cluster",
  summary: "Cluster summary",
  whyItMatters: "Cluster importance",
  learningGoal: "Cluster goal",
  orderIndex: 0,
  depth: 0,
  positionColumn: 0,
  positionRow: 0,
  status: "ready",
  difficultyBands: null,
} satisfies CurriculumNode;

const unitRun = {
  unitId: "00000000-0000-0000-0000-000000000003",
  sessionId: "00000000-0000-0000-0000-000000000010",
  userId: "user-1",
  recipeVersion: "education-unit-v1",
  phase: "connect",
  pass: 1,
  connectGrills: 0,
  solveRepairs: 0,
  scenarioSpec: null,
  difficultySnapshot: {
    nodeId: "cluster-1",
    directive: {
      intent: "probe",
      bandOrder: 0,
      supportLevel: "guided",
      targetItemRating: 1100,
      targetMisconceptionCode: null,
      reason: "Calibrated probe",
      nextProgress: { bandOrder: 0, supportLevel: "guided" },
    },
    promptBlock: "Keep difficulty fixed at 1100.",
    ratingSnapshot: "1100 ±200",
    learnerRating: 1100,
  },
} satisfies PersistedUnitRun;

const turn = {
  plan: { nodes: [clusterNode, node] },
  allResponses: [],
  state: { mode: "education_unit" } as WorkspaceAiState,
  node,
  unit: {
    id: "00000000-0000-0000-0000-000000000003",
    nodeId: "node-1",
  } as UnitContent,
  unitRun,
  unitResponses: [],
} as unknown as ResolvedWorkspaceTurn;

void test("a claimed, in-flight education turn is rejected before running the model", async () => {
  const deps = {
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "processing" as const }),
    getActivePlan: () => fail("getActivePlan"),
    listMessages: () => fail("listMessages"),
    getWorkspaceSummary: () => fail("getWorkspaceSummary"),
    upsertWorkspaceSummary: () => fail("upsertWorkspaceSummary"),
    appendMessage: () => fail("appendMessage"),
    listPhaseResponsesBySession: () => fail("listPhaseResponsesBySession"),
    getPhaseResponses: () => fail("getPhaseResponses"),
    getUnitRun: () => fail("getUnitRun"),
    upsertUnitRun: () => fail("upsertUnitRun"),
    getUnitByNodeId: () => fail("getUnitByNodeId"),
    savePhaseResponse: () => fail("savePhaseResponse"),
    updateUnitMasteryContract: () => fail("updateUnitMasteryContract"),
    updateScenarioContract: () => fail("updateScenarioContract"),
    saveAttempt: () => fail("saveAttempt"),
    completeNode: () => fail("completeNode"),
    commitEducationTurn: () => fail("commitEducationTurn"),
    commitRecallTurn: () => fail("commitRecallTurn"),
    commitNextScenarioPrompt: () => fail("commitNextScenarioPrompt"),
    touchSession: () => fail("touchSession"),
    listMemories: () => fail("listMemories"),
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  await assert.rejects(
    () =>
      runEducationUnitTurn({
        sessionId: "00000000-0000-0000-0000-000000000010",
        userId: "user-1",
        turnId: "turn-1",
        turnLeaseId: "00000000-0000-0000-0000-000000000099",
        message: "My answer",
        turn,
        deps,
      }),
    /already being processed/i,
  );
});

void test("an invalid education-unit result is never persisted", async () => {
  let commitCalled = false;
  let assistantStreamed = false;
  const contractError = new EducationUnitContractError({
    message: "Missing phase event.",
  });

  const deps = {
    claimWorkspaceTurn: () => Promise.resolve({ status: "claimed" as const }),
    listMessages: () => Promise.resolve([]),
    getWorkspaceSummary: () => Promise.resolve(null),
    upsertWorkspaceSummary: () => Promise.resolve(),
    listMemories: () => Promise.resolve([]),
    runUnitTurn: () => Promise.reject(contractError),
    commitEducationTurn: () => {
      commitCalled = true;
      return fail("commitEducationTurn");
    },
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  await assert.rejects(
    () =>
      runEducationUnitTurn({
        sessionId: "00000000-0000-0000-0000-000000000010",
        userId: "user-1",
        turnId: "turn-1",
        turnLeaseId: "00000000-0000-0000-0000-000000000099",
        message: "My complete learner answer",
        turn,
        deps,
        onAssistantMessage: () => {
          assistantStreamed = true;
        },
      }),
    (error) => error === contractError,
  );

  assert.equal(commitCalled, false);
  assert.equal(assistantStreamed, false);
});

void test("an education turn returns the committed assistant message", async () => {
  let modelContext = "";
  let committed = false;
  let emittedAfterCommit = false;
  const assistantMessage = {
    id: "message-2",
    role: "assistant" as const,
    content: "Use the evidence to choose the next probe.",
    sequence: 2,
    slot: "education_unit" as const,
    unitId: node.id,
    metadata: null,
  };
  const deps = {
    appendMessage: () =>
      Promise.resolve({
        ...assistantMessage,
        id: "message-1",
        role: "user" as const,
        content: "I would isolate one variable first.",
        sequence: 1,
      }),
    listMessages: () => Promise.resolve([]),
    getWorkspaceSummary: () => Promise.resolve(null),
    upsertWorkspaceSummary: () => Promise.resolve(),
    listMemories: () => Promise.resolve([]),
    resolveDifficultyDirective: () => fail("resolveDifficultyDirective"),
    runUnitTurn: (input: { contextBlock: string }) => {
      modelContext = input.contextBlock;
      return Promise.resolve({
        assistantMessage: assistantMessage.content,
        event: { type: "connection_graded" as const, passed: true },
        nextState: { ...unitRun, phase: "solve" as const },
        forcedConnectAdvance: false,
        gradeReasoning: "The learner selected a discriminating probe.",
        ratingWrite: null,
      });
    },
    commitEducationTurn: () => {
      committed = true;
      return Promise.resolve({ assistantMessage });
    },
    listPhaseResponsesBySession: () => Promise.resolve([]),
    getUnitByNodeId: () => Promise.resolve(turn.unit),
    getPhaseResponses: () => Promise.resolve([]),
    getUnitRun: () => Promise.resolve(unitRun),
    upsertUnitRun: () => Promise.resolve(unitRun),
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  const result = await runEducationUnitTurn({
    sessionId: unitRun.sessionId,
    userId: "user-1",
    turnId: null,
    turnLeaseId: null,
    message: "I would isolate one variable first.",
    turn,
    deps,
    onAssistantMessage: () => {
      emittedAfterCommit = committed;
    },
  });

  assert.equal(result.assistantMessage, assistantMessage);
  assert.match(modelContext, /Keep difficulty fixed at 1100/);
  assert.equal(emittedAfterCommit, true);
});
