import { describe, expect, it, vi } from "vitest";

import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { getAiWorkspaceWorkflow } from "../workflows/get-ai-workspace-workflow";
import { resolveWorkspaceTurn } from "./workspace-turn";

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
