import { describe, expect, it, vi } from "vitest";

import type { PersistedUnitRun } from "../education-unit/unit";
import type { RecallCandidateEntry } from "../policies/recall-decay";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { getAiWorkspaceWorkflow } from "../workflows/get-ai-workspace-workflow";
import { planNextWorkspaceTurn, resolveWorkspaceTurn } from "./workspace-turn";

const readyNode = {
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

const plan = { nodes: [readyNode] } as CurriculumPlan;

const completedNode = {
  ...readyNode,
  id: "node-recall",
  title: "Completed unit",
  orderIndex: 0,
  status: "completed",
} satisfies CurriculumNode;
const recallPlan = {
  id: "plan-1",
  nodes: [completedNode, readyNode],
} as CurriculumPlan;
const recallUnit = {
  id: "unit-content-recall",
  nodeId: completedNode.id,
} as UnitContent;
const activeUnit = {
  id: "unit-content-active",
  nodeId: readyNode.id,
} as UnitContent;
const recallRun = {
  unitId: recallUnit.id,
  sessionId: "session-1",
  userId: "user-1",
  recipeVersion: "recall-v1",
  phase: "solve",
  pass: 2,
  connectGrills: 0,
  solveRepairs: 1,
  scenarioSpec: null,
  difficultySnapshot: null,
} satisfies PersistedUnitRun;
const recallCandidate = {
  id: "entry-1",
  clusterNodeId: "cluster-1",
  label: "Stable boundaries",
  gloss: "Keep responsibility at the canonical boundary.",
  checkedAt: new Date("2026-01-01T00:00:00Z"),
  strength: 0,
  // A failed verdict just reset the decay clock, so this is deliberately not due.
  lastReinforcedAt: new Date("2026-07-05T00:00:00Z"),
  evidenceNodeId: completedNode.id,
} satisfies RecallCandidateEntry;
const recallPresentation = {
  id: "response-1",
  unitContentId: recallUnit.id,
  sessionId: "session-1",
  userId: "user-1",
  phase: "ai_education" as const,
  sequence: 0,
  userResponse: "Start checkpoint",
  aiResponse: "Scenario",
  passed: false,
  score: null,
  metadata: {
    aiEducationStage: "solve" as const,
    recallEntryIds: [recallCandidate.id],
  },
  createdAt: new Date("2026-07-05T00:00:00Z"),
};

const recallDeps = (entryIds: string[] = [recallCandidate.id]) => ({
  getActivePlan: () => Promise.resolve(recallPlan),
  listPhaseResponsesBySession: () => Promise.resolve([recallPresentation]),
  getPhaseResponses: (unitContentId: string) =>
    Promise.resolve(
      unitContentId === recallUnit.id
        ? [
            {
              ...recallPresentation,
              metadata: {
                ...recallPresentation.metadata,
                recallEntryIds: entryIds,
              },
            },
          ]
        : [],
    ),
  getUnitRun: () => Promise.resolve(null),
  getInFlightRecallRun: () => Promise.resolve(recallRun),
  retireInFlightRecallRun: vi.fn().mockResolvedValue(undefined),
  getUnitByNodeId: (nodeId: string) =>
    Promise.resolve(nodeId === completedNode.id ? recallUnit : activeUnit),
  listRecallCandidates: () => Promise.resolve([recallCandidate]),
});

describe("workspace read preparation boundary", () => {
  it("getAiWorkspaceWorkflow reports a missing unit without preparing it", async () => {
    const prepareUnit = vi.fn().mockResolvedValue(undefined);
    const scheduleBackgroundTask = vi.fn();
    const upsertUnitRun = vi.fn();
    const stalePreparationDeps = {
      prepareUnit,
      scheduleBackgroundTask,
      upsertUnitRun,
    };
    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(plan),
        listMessages: () => Promise.resolve([]),
        listPhaseResponsesBySession: () => Promise.resolve([]),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: () => Promise.resolve(null),
        listRecallCandidates: () => Promise.resolve([]),
        getScenarioAttemptStartedAt: () => Promise.resolve(null),
        // Deliberately pass the former capabilities to guard against a
        // regression even if callers retain stale dependency objects.
        ...stalePreparationDeps,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(UnitNotReadyError);
    }
    expect(prepareUnit).not.toHaveBeenCalled();
    expect(scheduleBackgroundTask).not.toHaveBeenCalled();
    expect(upsertUnitRun).not.toHaveBeenCalled();
  });

  it("resolveWorkspaceTurn reports a missing unit without prewarming it", async () => {
    const prewarmWorkspaceUnit = vi.fn().mockResolvedValue(undefined);
    const upsertUnitRun = vi.fn();
    const stalePreparationDeps = { prewarmWorkspaceUnit, upsertUnitRun };

    await expect(
      resolveWorkspaceTurn({
        sessionId: "session-1",
        deps: {
          getActivePlan: () => Promise.resolve(plan),
          listPhaseResponsesBySession: () => Promise.resolve([]),
          getPhaseResponses: () => Promise.resolve([]),
          getUnitRun: () => Promise.resolve(null),
          getInFlightRecallRun: () => Promise.resolve(null),
          retireInFlightRecallRun: () => Promise.resolve(),
          getUnitByNodeId: () => Promise.resolve(null),
          listRecallCandidates: () => Promise.resolve([]),
          ...stalePreparationDeps,
        },
      }),
    ).rejects.toBeInstanceOf(UnitNotReadyError);

    expect(prewarmWorkspaceUnit).not.toHaveBeenCalled();
    expect(upsertUnitRun).not.toHaveBeenCalled();
  });

  it("derives an initial run in memory when the run row is missing", async () => {
    const unit = {
      id: "unit-content-1",
      nodeId: readyNode.id,
    } as UnitContent;
    const upsertUnitRun = vi.fn();

    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(plan),
        listPhaseResponsesBySession: () => Promise.resolve([]),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: () => Promise.resolve(unit),
        listRecallCandidates: () => Promise.resolve([]),
        ...{ upsertUnitRun },
      },
    });

    expect(turn.unitRun).toEqual({
      unitId: unit.id,
      sessionId: "session-1",
      userId: null,
      recipeVersion: "education-unit-v1",
      phase: "orient",
      pass: 1,
      connectGrills: 0,
      solveRepairs: 0,
      scenarioSpec: null,
      difficultySnapshot: null,
    });
    expect(turn.state).toMatchObject({
      mode: "education_unit",
      educationStage: "orient",
      workflowId: "education-unit-v1",
    });
    expect(upsertUnitRun).not.toHaveBeenCalled();
  });
});

describe("durable recall projection", () => {
  it("resumes a failed recall even after its decay clock was reset", async () => {
    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: recallDeps(),
    });

    expect(turn.state).toMatchObject({
      recallUnitId: completedNode.id,
      activeUnitId: null,
      workflowId: "recall-v1",
      educationStage: "solve",
    });
    expect(turn.unitRun).toBe(recallRun);
    expect(turn.recallFocus?.primary.id).toBe(recallCandidate.id);
  });

  it("keeps the post-commit replan on the unfinished recall", async () => {
    const { getActivePlan: _getActivePlan, ...deps } = recallDeps();
    const state = await planNextWorkspaceTurn({
      sessionId: "session-1",
      plan: recallPlan,
      deps,
    });

    expect(state).toMatchObject({
      recallUnitId: completedNode.id,
      activeUnitId: null,
    });
  });

  it("falls through when a stale recall target cannot be reconstructed", async () => {
    const deps = recallDeps(["deleted-entry"]);
    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps,
    });

    expect(turn.state).toMatchObject({
      activeUnitId: readyNode.id,
      recallUnitId: null,
      workflowId: "education-unit-v1",
    });
    expect(deps.retireInFlightRecallRun).toHaveBeenCalledWith(
      "session-1",
      recallRun.unitId,
    );
  });

  it("still falls through when retiring the stale recall fails", async () => {
    const deps = {
      ...recallDeps(["deleted-entry"]),
      retireInFlightRecallRun: vi
        .fn()
        .mockRejectedValue(new Error("db unavailable")),
    };
    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps,
    });

    expect(turn.state).toMatchObject({
      activeUnitId: readyNode.id,
      recallUnitId: null,
      workflowId: "education-unit-v1",
    });
  });
});
