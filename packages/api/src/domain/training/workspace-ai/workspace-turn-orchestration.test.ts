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
    createUnitContent: () => fail("createUnitContent"),
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
