import { describe, expect, it, vi } from "vitest";

import type { PersistedUnitRun } from "../education-unit/unit-state";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";
import { makeUnitContext } from "../education-unit/unit-context.fixture";
import { createUnitRun } from "../education-unit/unit-state";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { getAiWorkspaceWorkflow } from "../workflows/get-ai-workspace-workflow";
import { NoRunnableWorkspaceTurnError } from "./workspace-errors";
import { resolveWorkspaceTurn } from "./workspace-turn";

const readyNode = {
  id: "node-1",
  parentNodeId: "outcome-1",
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
const outcomeNode = {
  ...completedNode,
  id: "outcome-1",
  parentNodeId: null,
  kind: "outcome",
  title: "Outcome",
} satisfies CurriculumNode;
const recallPlan = {
  id: "plan-1",
  nodes: [outcomeNode, completedNode, readyNode],
} as CurriculumPlan;
const unitContext = makeUnitContext();
const unitStateFields = {
  difficultyBands: null,
  title: "Stable boundaries",
  summary: "Keep one canonical boundary.",
  whyItMatters: "Duplicated ownership creates divergent behavior.",
  learningGoal: "Choose and defend the canonical boundary.",
  clusterArcFrame: null,
  clusterBriefing: null,
  scenario: {
    title: "A duplicated boundary",
    focusAreas: ["ownership"],
  },
};
const recallUnit = {
  ...unitStateFields,
  id: "unit-content-recall",
  nodeId: completedNode.id,
  unitContext,
} as UnitContent;
const activeUnit = {
  ...unitStateFields,
  id: "unit-content-active",
  nodeId: readyNode.id,
  unitContext,
} as UnitContent;
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
        listUnitMessages: () => Promise.resolve([]),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getUnitByNodeId: () => Promise.resolve(null),
        // Deliberately pass the former capabilities to guard against a
        // regression even if callers retain stale dependency objects.
        ...stalePreparationDeps,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        kind: "preparing",
        nodeId: expect.any(String) as string,
      });
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
          getPhaseResponses: () => Promise.resolve([]),
          getUnitRun: () => Promise.resolve(null),
          getUnitByNodeId: () => Promise.resolve(null),
          ...stalePreparationDeps,
        },
      }),
    ).rejects.toBeInstanceOf(UnitNotReadyError);

    expect(prewarmWorkspaceUnit).not.toHaveBeenCalled();
    expect(upsertUnitRun).not.toHaveBeenCalled();
  });

  it("treats a pre-refactor unit contract as unprepared", async () => {
    const staleUnit = {
      id: "unit-content-1",
      nodeId: readyNode.id,
      unitContext: {
        version: 1,
        dimensions: [{ id: "legacy-dimension" }],
      },
    } as unknown as UnitContent;

    await expect(
      resolveWorkspaceTurn({
        sessionId: "session-1",
        deps: {
          getActivePlan: () => Promise.resolve(plan),
          getPhaseResponses: () => Promise.resolve([]),
          getUnitRun: () => Promise.resolve(null),
          getUnitByNodeId: () => Promise.resolve(staleUnit),
        },
      }),
    ).rejects.toBeInstanceOf(UnitNotReadyError);
  });

  it("derives an initial run in memory when the run row is missing", async () => {
    const unit = {
      ...activeUnit,
      id: "unit-content-1",
      nodeId: readyNode.id,
    } as UnitContent;
    const upsertUnitRun = vi.fn();

    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(plan),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getUnitByNodeId: () => Promise.resolve(unit),
        ...{ upsertUnitRun },
      },
    });

    expect(turn.unitRun).toEqual(
      createUnitRun({
        unitId: unit.id,
        sessionId: "session-1",
        kind: "education",
        unitContext,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
    );
    expect(turn.state).toMatchObject({
      mode: "education_unit",
      educationStage: "teach",
      workflowId: "breakpoint-mentor@2",
    });
    expect(upsertUnitRun).not.toHaveBeenCalled();
  });

  it("snapshots the account customization onto a new unit run", async () => {
    const unit = {
      ...activeUnit,
      id: "unit-content-1",
      nodeId: readyNode.id,
    } as UnitContent;
    const customizedExperience = {
      ...DEFAULT_EDUCATION_EXPERIENCE,
      snapshot: { id: "customized-breakpoint-mentor", version: 4 },
      main: { instructions: "Use the customized mentor behavior." },
    };

    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: {
        getEducationExperience: () => Promise.resolve(customizedExperience),
        getActivePlan: () => Promise.resolve(plan),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getUnitByNodeId: () => Promise.resolve(unit),
      },
    });

    expect(turn.unitRun.experience).toMatchObject({
      id: "customized-breakpoint-mentor",
      version: 4,
      main: { instructions: "Use the customized mentor behavior." },
    });
    expect(turn.state.workflowId).toBe("customized-breakpoint-mentor@4");
  });

  it("reuses an authorized plan without reading it again", async () => {
    const getActivePlan = vi.fn();
    const unit = {
      ...activeUnit,
      id: "unit-content-1",
      nodeId: readyNode.id,
    } as UnitContent;

    await resolveWorkspaceTurn({
      sessionId: "session-1",
      authorizedPlan: plan,
      deps: {
        getActivePlan,
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getUnitByNodeId: () => Promise.resolve(unit),
      },
    });

    expect(getActivePlan).not.toHaveBeenCalled();
  });
});

describe("workspace view reads", () => {
  const readyView = (
    result: Awaited<ReturnType<typeof getAiWorkspaceWorkflow>>,
  ) => {
    if (!result.success) {
      throw new Error(`expected success, got ${String(result.error)}`);
    }
    if (result.data.kind !== "ready") {
      throw new Error(`expected ready workspace, got ${result.data.kind}`);
    }
    return result.data.workspace;
  };

  const unitMessage = (unitId: string, content: string) => ({
    role: "assistant" as const,
    content,
    sequence: 0,
    slot: "education_unit",
    unitId,
    turnId: null,
    metadata: null,
  });

  it("reads only the active unit's transcript, never the whole session", async () => {
    const laterReadyNode = {
      ...readyNode,
      id: "node-2",
      orderIndex: 2,
      title: "Later unit",
    } satisfies CurriculumNode;
    const unsortedPlan = {
      ...recallPlan,
      nodes: [outcomeNode, laterReadyNode, completedNode, readyNode],
    };
    const listUnitMessages = vi
      .fn()
      .mockResolvedValue([unitMessage(readyNode.id, "Scenario prompt")]);
    const getUnitByNodeId = vi.fn((nodeId: string) =>
      Promise.resolve(
        nodeId === readyNode.id
          ? activeUnit
          : ({
              ...activeUnit,
              id: "unit-content-later",
              nodeId,
            } as UnitContent),
      ),
    );

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(unsortedPlan),
        listUnitMessages,
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getUnitByNodeId,
      },
    });

    const view = readyView(result);
    expect(view.state).toMatchObject({
      activeUnitId: readyNode.id,
      recallUnitId: null,
      educationStage: "teach",
    });
    expect(view.messages).toEqual([
      unitMessage(readyNode.id, "Scenario prompt"),
    ]);
    expect(view.unit).toMatchObject({
      id: activeUnit.id,
      nodeId: readyNode.id,
      activeStage: "challenge",
    });
    expect(view.introMessage).toBeNull();
    expect(getUnitByNodeId).toHaveBeenCalledWith(readyNode.id);
    expect(listUnitMessages).toHaveBeenCalledWith("session-1", readyNode.id);
  });

  it("loads a live-mentor unit without legacy teaching content", async () => {
    const unitWithoutLegacyTeaching = {
      ...activeUnit,
    } as UnitContent;

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(recallPlan),
        listUnitMessages: () => Promise.resolve([]),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getUnitByNodeId: () => Promise.resolve(unitWithoutLegacyTeaching),
      },
    });

    const view = readyView(result);
    expect(view.unit.challenge).toMatchObject({
      prompt: "Your lesson is ready to start.",
      helper: null,
    });
  });

  it("keeps completed-unit advancement enabled", async () => {
    const activeMasteredRun = {
      ...createUnitRun({
        unitId: activeUnit.id,
        sessionId: "session-1",
        userId: "user-1",
        kind: "education",
        unitContext,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
      mode: "complete" as const,
    } satisfies PersistedUnitRun;
    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(recallPlan),
        listUnitMessages: () => Promise.resolve([]),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(activeMasteredRun),
        getUnitByNodeId: (nodeId: string) =>
          Promise.resolve(
            nodeId === completedNode.id ? recallUnit : activeUnit,
          ),
      },
    });

    const view = readyView(result);
    expect(view.state).toMatchObject({
      recallUnitId: null,
      activeUnitId: readyNode.id,
    });
    expect(view.unitAdvanceGate).toEqual({
      status: "enabled",
      unitId: readyNode.id,
      nextTitle: null,
    });
  });

  it("does not hydrate a transcript when no turn is runnable", async () => {
    const completedOnlyPlan = {
      id: "plan-1",
      nodes: [outcomeNode, completedNode],
    } as CurriculumPlan;
    const listUnitMessages = vi.fn().mockResolvedValue([]);

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(completedOnlyPlan),
        listUnitMessages,
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getUnitByNodeId: () => Promise.resolve(null),
      },
    });

    expect(result).toEqual({
      success: true,
      data: { kind: "complete", plan: completedOnlyPlan },
    });
    expect(listUnitMessages).not.toHaveBeenCalled();
  });

  /*
   * The learner finished the last unit of an outcome. `advanceCompletedUnit`
   * marks the next planned sibling ready in the same transaction, so the
   * within-outcome gap is atomic — but the *between-outcome* gap is not: the
   * next outcome is still planned and owns no unit nodes yet. That window is
   * reachable in normal play, so it is preparation, not a broken curriculum.
   */
  it("reports preparing between outcomes, when the next outcome owns no units yet", async () => {
    const betweenOutcomesPlan = {
      id: "plan-1",
      nodes: [
        { ...outcomeNode, status: "completed" as const },
        completedNode,
        {
          ...outcomeNode,
          id: "outcome-2",
          title: "Next outcome",
          orderIndex: 2,
          status: "planned" as const,
        },
      ],
    } as CurriculumPlan;

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(betweenOutcomesPlan),
        listUnitMessages: () => Promise.resolve([]),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getUnitByNodeId: () => Promise.resolve(null),
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "preparing", nodeId: null });
    }
  });

  it("rejects a curriculum that owns no outcomes at all", async () => {
    const outcomelessPlan = {
      id: "plan-1",
      nodes: [completedNode],
    } as CurriculumPlan;

    await expect(
      getAiWorkspaceWorkflow({
        sessionId: "session-1",
        deps: {
          getActivePlan: () => Promise.resolve(outcomelessPlan),
          listUnitMessages: () => Promise.resolve([]),
          getPhaseResponses: () => Promise.resolve([]),
          getUnitRun: () => Promise.resolve(null),
          getUnitByNodeId: () => Promise.resolve(null),
        },
      }),
    ).rejects.toBeInstanceOf(NoRunnableWorkspaceTurnError);
  });
});
