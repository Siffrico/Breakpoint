import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import { advanceCompletedUnitWorkflow } from "./advance-completed-unit-workflow";

const currentNode = {
  id: "node-1",
  parentNodeId: "cluster-1",
  kind: "unit",
  title: "Current unit",
  summary: "Current summary",
  whyItMatters: "Current rationale",
  learningGoal: "Current goal",
  orderIndex: 1,
  depth: 1,
  positionColumn: 0,
  positionRow: 1,
  status: "ready",
  difficultyBands: null,
} satisfies CurriculumNode;

const nextNode = {
  ...currentNode,
  id: "node-2",
  title: "Next unit",
  orderIndex: 2,
} satisfies CurriculumNode;

const abilityNode = {
  ...currentNode,
  id: "ability-1",
  parentNodeId: null,
  kind: "ability",
  orderIndex: 0,
} satisfies CurriculumNode;

const unit = {
  id: "unit-content-1",
  nodeId: currentNode.id,
} as UnitContent;

const masteredRun = {
  unitId: unit.id,
  sessionId: "session-1",
  userId: "user-1",
  recipeVersion: "education-unit-v2",
  phase: "mastered",
  pass: 2,
  connectGrills: 0,
  solveRepairs: 0,
  scenarioSpec: null,
  difficultySnapshot: null,
} satisfies PersistedUnitRun;

describe("advanceCompletedUnitWorkflow", () => {
  it("routes a mastered ability unit to its required mission without completing it", async () => {
    const completeNode = vi.fn(() => Promise.resolve());
    const advanceSkillMapNode = vi.fn(() => Effect.void);
    const abilityUnit = { ...currentNode, parentNodeId: abilityNode.id };

    const result = await advanceCompletedUnitWorkflow({
      sessionId: "session-1",
      nodeId: abilityUnit.id,
      deps: {
        withTransaction: (run) =>
          run({
            getActivePlan: () =>
              Promise.resolve({
                nodes: [abilityNode, abilityUnit],
              } as CurriculumPlan),
            getUnitByNodeId: () => Promise.resolve(unit),
            getUnitRun: () => Promise.resolve(masteredRun),
            completeNode,
            markNodeReady: () => Promise.resolve(),
            touchSession: () => Promise.resolve(),
          }),
        createUnit: () => Effect.void,
        getProgressionState: () =>
          Effect.succeed({
            regime: "skillset" as const,
            skillsBelowRepTarget: 0,
            learnerRating: 1_800,
            ratingDeviation: 50,
            masteryRating: 1_800,
          }),
        getMissionStatus: () =>
          Promise.resolve({ unitRunId: "run-1", status: "active" }),
        advanceSkillMapNode,
      },
    });

    expect(result).toEqual({
      success: true,
      data: {
        advanced: false,
        missionRequired: true,
        unitRunId: "run-1",
      },
    });
    expect(completeNode).not.toHaveBeenCalled();
    expect(advanceSkillMapNode).not.toHaveBeenCalled();
  });

  it("commits immediately and creates the next unit in the background", async () => {
    const events: string[] = [];
    const createUnit = vi.fn(() => {
      events.push("create_unit");
      return Effect.void;
    });

    const result = await advanceCompletedUnitWorkflow({
      sessionId: "session-1",
      nodeId: currentNode.id,
      deps: {
        withTransaction: async (run) => {
          events.push("transaction:start");
          const value = await run({
            getActivePlan: () =>
              Promise.resolve({
                nodes: [currentNode, nextNode],
              } as CurriculumPlan),
            getUnitByNodeId: () => Promise.resolve(unit),
            getUnitRun: () => Promise.resolve(masteredRun),
            completeNode: () => Promise.resolve(nextNode),
            markNodeReady: () => Promise.resolve(),
            touchSession: () => Promise.resolve(),
          });
          events.push("transaction:commit");
          return value;
        },
        createUnit,
        getProgressionState: () =>
          Effect.succeed({
            regime: "foundation" as const,
            entries: [{ coverageCount: 1 }, { coverageCount: 0 }],
            coverageTarget: 3,
          }),
        getMissionStatus: () => Promise.resolve(null),
        advanceSkillMapNode: () => Effect.void,
      },
    });

    await vi.waitFor(() => expect(createUnit).toHaveBeenCalledOnce());

    expect(result).toEqual({
      success: true,
      data: { advanced: true, nextReadyNode: null },
    });
    expect(createUnit).toHaveBeenCalledWith({
      skillNodeId: "cluster-1",
      sessionId: "session-1",
      userId: "user-1",
    });
    expect(events).toEqual([
      "transaction:start",
      "transaction:commit",
      "transaction:start",
      "transaction:commit",
      "create_unit",
    ]);
  });

  it("skips the mastery loop quietly for legacy plans without a skill map", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const createUnit = vi.fn(() => Effect.void);
    const advanceSkillMapNode = vi.fn(() => Effect.void);

    const result = await advanceCompletedUnitWorkflow({
      sessionId: "session-1",
      nodeId: currentNode.id,
      deps: {
        withTransaction: (run) =>
          run({
            getActivePlan: () =>
              Promise.resolve({
                nodes: [currentNode, nextNode],
              } as CurriculumPlan),
            getUnitByNodeId: () => Promise.resolve(unit),
            getUnitRun: () => Promise.resolve(masteredRun),
            completeNode: () => Promise.resolve(nextNode),
            markNodeReady: () => Promise.resolve(),
            touchSession: () => Promise.resolve(),
          }),
        createUnit,
        getProgressionState: () => Effect.succeed(null),
        getMissionStatus: () => Promise.resolve(null),
        advanceSkillMapNode,
      },
    });

    await vi.waitFor(() => expect(consoleError).not.toHaveBeenCalled());

    expect(result.success).toBe(true);
    expect(createUnit).not.toHaveBeenCalled();
    expect(advanceSkillMapNode).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("promotes a prepared planned sibling inside the completing transaction", async () => {
    const plannedNode = {
      ...nextNode,
      status: "planned",
    } satisfies CurriculumNode;
    const markNodeReady = vi.fn(() => Promise.resolve());
    const createUnit = vi.fn(() => Effect.void);

    const result = await advanceCompletedUnitWorkflow({
      sessionId: "session-1",
      nodeId: currentNode.id,
      deps: {
        withTransaction: (run) =>
          run({
            getActivePlan: () =>
              Promise.resolve({
                nodes: [currentNode, plannedNode],
              } as CurriculumPlan),
            getUnitByNodeId: (nodeId) =>
              Promise.resolve(
                nodeId === plannedNode.id
                  ? ({ id: "unit-content-2", nodeId } as UnitContent)
                  : unit,
              ),
            getUnitRun: () => Promise.resolve(masteredRun),
            completeNode: () => Promise.resolve(),
            markNodeReady,
            touchSession: () => Promise.resolve(),
          }),
        createUnit,
        getProgressionState: () =>
          Effect.succeed({
            regime: "foundation" as const,
            entries: [{ coverageCount: 1 }],
            coverageTarget: 3,
          }),
        getMissionStatus: () => Promise.resolve(null),
        advanceSkillMapNode: () => Effect.void,
      },
    });

    expect(result).toEqual({
      success: true,
      data: {
        advanced: true,
        nextReadyNode: { ...plannedNode, status: "ready" },
      },
    });
    expect(markNodeReady).toHaveBeenCalledWith(plannedNode.id);
    expect(createUnit).not.toHaveBeenCalled();
  });

  it("promotes a contentless planned sibling and lets background creation prepare it", async () => {
    const plannedNode = {
      ...nextNode,
      status: "planned",
    } satisfies CurriculumNode;
    const createUnit = vi.fn(() => Effect.void);
    const markNodeReady = vi.fn(() => Promise.resolve());

    const result = await advanceCompletedUnitWorkflow({
      sessionId: "session-1",
      nodeId: currentNode.id,
      deps: {
        withTransaction: (run) =>
          run({
            getActivePlan: () =>
              Promise.resolve({
                nodes: [currentNode, plannedNode],
              } as CurriculumPlan),
            getUnitByNodeId: (nodeId) =>
              Promise.resolve(nodeId === plannedNode.id ? null : unit),
            getUnitRun: () => Promise.resolve(masteredRun),
            completeNode: () => Promise.resolve(),
            markNodeReady,
            touchSession: () => Promise.resolve(),
          }),
        createUnit,
        getProgressionState: () =>
          Effect.succeed({
            regime: "foundation" as const,
            entries: [{ coverageCount: 1 }],
            coverageTarget: 3,
          }),
        getMissionStatus: () => Promise.resolve(null),
        advanceSkillMapNode: () => Effect.void,
      },
    });

    // Promoted so the ready-scoped fallback adopts it instead of appending a
    // duplicate; createUnit still runs to generate the missing content.
    await vi.waitFor(() => expect(createUnit).toHaveBeenCalledOnce());
    expect(result).toEqual({
      success: true,
      data: {
        advanced: true,
        nextReadyNode: { ...plannedNode, status: "ready" },
      },
    });
    expect(markNodeReady).toHaveBeenCalledWith(plannedNode.id);
  });
});
