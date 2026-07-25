import assert from "node:assert/strict";
import { Effect } from "effect";
import { expect, test, vi } from "vitest";

import type { PersistedUnitRun } from "../education-unit/unit";
import type { CurriculumNode, UnitContent } from "../types/training.types";
import type { WorkspaceAiState } from "./types";
import type { ResolvedWorkspaceTurn } from "./workspace-turn";
import type { WorkspaceTurnOrchestrationDependencies } from "./workspace-turn-orchestration";
import type { WorkspaceEducationTurnCommit } from "./workspace-turn-persistence";
import type { WorkspaceTurnRepoShape } from "./workspace-turn-repo";
import { EducationUnitContractError } from "../education-unit/orchestrate-unit-turn";
import { runEducationUnitTurn } from "./workspace-turn-orchestration";
import { WorkspaceTurnRepo } from "./workspace-turn-repo";

const runEducationTest = <A, E>(
  effect: Effect.Effect<A, E, WorkspaceTurnRepo>,
  commitEducationTurn: WorkspaceTurnRepoShape["commitEducationTurn"] = () =>
    Effect.die("commitEducationTurn should not be called"),
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(WorkspaceTurnRepo, { commitEducationTurn }),
    ),
  );

const fail = (name: string): never => {
  throw new Error(`${name} should not be called`);
};

const noRecallProjectionDeps = {
  getRecallCandidatesByIds: () => Promise.resolve([]),
  getMostOverdueRecallCandidate: () => Promise.resolve(null),
  getRecallCompanionCandidate: () => Promise.resolve(null),
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
  kind: "ability",
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
  recipeVersion: "education-unit-v2",
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
    listUnitMessages: () => fail("listUnitMessages"),
    appendMessage: () => fail("appendMessage"),
    getPhaseResponses: () => fail("getPhaseResponses"),
    getUnitRun: () => fail("getUnitRun"),
    getInFlightRecallRun: () => fail("getInFlightRecallRun"),
    upsertUnitRun: () => fail("upsertUnitRun"),
    getUnitByNodeId: () => fail("getUnitByNodeId"),
    ...noRecallProjectionDeps,
    commitEducationTurn: () => fail("commitEducationTurn"),
    listMemories: () => fail("listMemories"),
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  await assert.rejects(
    () =>
      runEducationTest(
        runEducationUnitTurn({
          sessionId: "00000000-0000-0000-0000-000000000010",
          userId: "user-1",
          turnId: "turn-1",
          turnLeaseId: "00000000-0000-0000-0000-000000000099",
          message: "My answer",
          turn,
          deps,
        }),
      ),
    /already being processed/i,
  );
});

void test("a concurrent unit lease is rejected before running the model", async () => {
  const runUnitTurn = vi.fn();
  const markWorkspaceTurnFailed = vi.fn(() => Promise.resolve());
  const deps = {
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "claimed" as const, claimedAt: new Date() }),
    claimWorkspaceUnitLease: () => Promise.resolve(false),
    releaseWorkspaceUnitLease: () => Promise.resolve(),
    markWorkspaceTurnFailed,
    runUnitTurn,
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  await assert.rejects(
    () =>
      runEducationTest(
        runEducationUnitTurn({
          sessionId: unitRun.sessionId,
          userId: "user-1",
          turnId: "turn-2",
          turnLeaseId: "00000000-0000-0000-0000-000000000098",
          message: "A different concurrent answer",
          turn,
          deps,
        }),
      ),
    /another answer is already being processed/i,
  );

  expect(runUnitTurn).not.toHaveBeenCalled();
  expect(markWorkspaceTurnFailed).toHaveBeenCalledOnce();
});

void test("an invalid education-unit result is never persisted", async () => {
  let commitCalled = false;
  let assistantStreamed = false;
  const contractError = new EducationUnitContractError({
    message: "Missing phase event.",
  });

  const deps = {
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "claimed" as const, claimedAt: new Date() }),
    claimWorkspaceUnitLease: () => Promise.resolve(true),
    releaseWorkspaceUnitLease: () => Promise.resolve(),
    listUnitMessages: () => Promise.resolve([]),
    listMemories: () => Promise.resolve([]),
    runUnitTurn: () => Effect.fail(contractError),
    commitEducationTurn: () => {
      commitCalled = true;
      return fail("commitEducationTurn");
    },
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  await assert.rejects(
    () =>
      runEducationTest(
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
        () => {
          commitCalled = true;
          return Effect.die("commitEducationTurn should not be called");
        },
      ),
    (error) => error === contractError,
  );

  assert.equal(commitCalled, false);
  assert.equal(assistantStreamed, false);
});

void test("interrupting a claimed education turn releases its owned lease", async () => {
  const markWorkspaceTurnFailed = vi.fn(() => Promise.resolve());
  const runUnitTurn = vi.fn(() => Effect.never);
  const deps = {
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "claimed" as const, claimedAt: new Date() }),
    claimWorkspaceUnitLease: () => Promise.resolve(true),
    releaseWorkspaceUnitLease: () => Promise.resolve(),
    listUnitMessages: () => Promise.resolve([]),
    listMemories: () => Promise.resolve([]),
    runUnitTurn,
    markWorkspaceTurnFailed,
  } as unknown as WorkspaceTurnOrchestrationDependencies;
  const controller = new AbortController();
  const effect = runEducationUnitTurn({
    sessionId: unitRun.sessionId,
    userId: "user-1",
    turnId: "turn-1",
    turnLeaseId: "00000000-0000-0000-0000-000000000099",
    message: "My complete learner answer",
    turn,
    deps,
  }).pipe(
    Effect.provideService(WorkspaceTurnRepo, {
      commitEducationTurn: () =>
        Effect.die("commitEducationTurn should not be called"),
    }),
  );

  const running = Effect.runPromise(effect, { signal: controller.signal });
  await vi.waitFor(() => expect(runUnitTurn).toHaveBeenCalledOnce());
  controller.abort();

  await expect(running).rejects.toBeDefined();
  expect(markWorkspaceTurnFailed).toHaveBeenCalledOnce();
  expect(markWorkspaceTurnFailed).toHaveBeenCalledWith({
    sessionId: unitRun.sessionId,
    turnId: "turn-1",
    leaseId: "00000000-0000-0000-0000-000000000099",
    reason: "Education turn ended before its atomic commit completed.",
  });
});

void test("a post-claim transcript load failure releases the lease", async () => {
  const markWorkspaceTurnFailed = vi.fn(() => Promise.resolve());
  const deps = {
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "claimed" as const, claimedAt: new Date() }),
    claimWorkspaceUnitLease: () => Promise.resolve(true),
    releaseWorkspaceUnitLease: () => Promise.resolve(),
    listUnitMessages: () => Promise.reject(new Error("message read failed")),
    markWorkspaceTurnFailed,
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  await expect(
    runEducationTest(
      runEducationUnitTurn({
        sessionId: unitRun.sessionId,
        userId: "user-1",
        turnId: "turn-1",
        turnLeaseId: "00000000-0000-0000-0000-000000000099",
        message: "My complete learner answer",
        turn,
        deps,
      }),
    ),
  ).rejects.toMatchObject({
    _tag: "WorkspacePersistenceError",
    operation: "listWorkspaceMessages",
  });
  expect(markWorkspaceTurnFailed).toHaveBeenCalledOnce();
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
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "claimed" as const, claimedAt: new Date() }),
    claimWorkspaceUnitLease: () => Promise.resolve(true),
    releaseWorkspaceUnitLease: () => Promise.resolve(),
    markWorkspaceTurnFailed: () => Promise.resolve(),
    appendMessage: () =>
      Promise.resolve({
        ...assistantMessage,
        id: "message-1",
        role: "user" as const,
        content: "I would isolate one variable first.",
        sequence: 1,
      }),
    listUnitMessages: () => Promise.resolve([]),
    listMemories: () => Promise.resolve([]),
    resolveDifficultyDirective: () => fail("resolveDifficultyDirective"),
    runUnitTurn: (input: { contextBlock: string }) => {
      modelContext = input.contextBlock;
      return Effect.succeed({
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
    getUnitByNodeId: () => Promise.resolve(turn.unit),
    ...noRecallProjectionDeps,
    getPhaseResponses: () => Promise.resolve([]),
    getUnitRun: () => Promise.resolve(unitRun),
    getInFlightRecallRun: () => Promise.resolve(null),
    upsertUnitRun: () => Promise.resolve(unitRun),
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  const result = await runEducationTest(
    runEducationUnitTurn({
      sessionId: unitRun.sessionId,
      userId: "user-1",
      turnId: "turn-1",
      turnLeaseId: "lease-1",
      message: "I would isolate one variable first.",
      turn,
      deps,
      onAssistantMessage: () => {
        emittedAfterCommit = committed;
      },
    }),
    () => {
      committed = true;
      return Effect.succeed({ assistantMessage });
    },
  );

  assert.equal(result.assistantMessage, assistantMessage);
  assert.match(modelContext, /Keep difficulty fixed at 1100/);
  assert.equal(emittedAfterCommit, true);
});

void test("a mastered unit checks off every target even when the evaluator omits the optional tool", async () => {
  const captured: { committed?: WorkspaceEducationTurnCommit } = {};
  const assistantMessage = {
    id: "message-2",
    role: "assistant" as const,
    content: "You applied both mechanisms correctly.",
    sequence: 2,
    slot: "education_unit" as const,
    unitId: node.id,
    metadata: null,
  };
  const deps = {
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "claimed" as const, claimedAt: new Date() }),
    claimWorkspaceUnitLease: () => Promise.resolve(true),
    releaseWorkspaceUnitLease: () => Promise.resolve(),
    markWorkspaceTurnFailed: () => Promise.resolve(),
    listUnitMessages: () => Promise.resolve([]),
    listMemories: () => Promise.resolve([]),
    resolveDifficultyDirective: () => fail("resolveDifficultyDirective"),
    getUnitKnowledgeContext: () =>
      Promise.resolve({
        skillNodeId: clusterNode.id,
        workflow: { name: "Diagnose", steps: ["Observe", "Explain"] },
        checked: [],
        targets: [
          { id: "entry-1", label: "First", gloss: "First mechanism" },
          { id: "entry-2", label: "Second", gloss: "Second mechanism" },
        ],
      }),
    runUnitTurn: () =>
      Effect.succeed({
        assistantMessage: assistantMessage.content,
        event: {
          type: "solution_graded" as const,
          passed: true,
          score: 92,
          errorCodes: [],
        },
        nextState: { ...unitRun, phase: "mastered" as const, pass: 2 },
        forcedConnectAdvance: false,
        gradeReasoning: "Both target mechanisms were applied.",
        ratingWrite: null,
        knowledgeCheckOff: null,
        scenarioSpec: null,
      }),
    getUnitByNodeId: () => Promise.resolve(turn.unit),
    ...noRecallProjectionDeps,
    getPhaseResponses: () => Promise.resolve([]),
    getUnitRun: () => Promise.resolve(unitRun),
    getInFlightRecallRun: () => Promise.resolve(null),
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  await runEducationTest(
    runEducationUnitTurn({
      sessionId: unitRun.sessionId,
      userId: "user-1",
      turnId: "turn-1",
      turnLeaseId: "lease-1",
      message: "Both mechanisms point to the same root cause.",
      turn,
      deps,
    }),
    (commit) => {
      captured.committed = commit;
      return Effect.succeed({ assistantMessage });
    },
  );

  assert.deepEqual(
    captured.committed?.knowledgeCheckOff?.requestedKnowledgeIds,
    ["entry-1", "entry-2"],
  );
});

void test("solve timing anchors on the turn claim, not the post-grading clock", async () => {
  // Fixture dates are deliberately in the past: if timing ever regresses to a
  // clock read taken after the model call, elapsed becomes weeks and the
  // wasOverTime assertion below fails.
  const solvePresentedAt = new Date("2026-07-01T10:00:00.000Z");
  const claimedAt = new Date("2026-07-01T10:02:00.000Z");
  const captured: { committed?: WorkspaceEducationTurnCommit } = {};
  const assistantMessage = {
    id: "message-2",
    role: "assistant" as const,
    content: "Correct — the second probe isolates the fault.",
    sequence: 2,
    slot: "education_unit" as const,
    unitId: node.id,
    metadata: null,
  };
  const ratedTurn = {
    ...turn,
    unitResponses: [
      {
        phase: "ai_education",
        metadata: { scenarioAttemptId: "attempt-1" },
      },
    ],
  } as unknown as ResolvedWorkspaceTurn;
  const deps = {
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "claimed" as const, claimedAt }),
    claimWorkspaceUnitLease: () => Promise.resolve(true),
    releaseWorkspaceUnitLease: () => Promise.resolve(),
    markWorkspaceTurnFailed: () => Promise.resolve(),
    listUnitMessages: () => Promise.resolve([]),
    listMemories: () => Promise.resolve([]),
    resolveDifficultyDirective: () => fail("resolveDifficultyDirective"),
    getScenarioAttempt: () =>
      Promise.resolve({ id: "attempt-1", solvePresentedAt }),
    runUnitTurn: () =>
      Effect.succeed({
        assistantMessage: assistantMessage.content,
        event: {
          type: "solution_graded" as const,
          passed: true,
          score: 78,
          errorCodes: [],
        },
        nextState: { ...unitRun, phase: "solve" as const, pass: 2 },
        forcedConnectAdvance: false,
        gradeReasoning: "The fix addressed the measured fault.",
        ratingWrite: { score: 78, errorCodes: [] },
        knowledgeCheckOff: null,
        scenarioSpec: null,
      }),
    getUnitByNodeId: () => Promise.resolve(turn.unit),
    ...noRecallProjectionDeps,
    getPhaseResponses: () => Promise.resolve([]),
    getUnitRun: () => Promise.resolve(unitRun),
    getInFlightRecallRun: () => Promise.resolve(null),
  } as unknown as WorkspaceTurnOrchestrationDependencies;

  await runEducationTest(
    runEducationUnitTurn({
      sessionId: unitRun.sessionId,
      userId: "user-1",
      turnId: "turn-1",
      turnLeaseId: "lease-1",
      message: "Swap the sensor and re-run the failing case.",
      turn: ratedTurn,
      deps,
    }),
    (commit) => {
      captured.committed = commit;
      return Effect.succeed({ assistantMessage });
    },
  );

  const evaluation = captured.committed?.ratingEvaluation;
  assert.ok(evaluation, "expected a rating evaluation on the commit");
  assert.equal(evaluation.scenarioAttemptId, "attempt-1");
  // 120s elapsed against a 300s budget — in time when measured from the claim.
  assert.equal(evaluation.wasOverTime, false);
  // occurredAt stays grading time: it orders evidence and is divorced from
  // the learner-facing timing measurement.
  assert.ok(evaluation.occurredAt.getTime() > claimedAt.getTime());
});
