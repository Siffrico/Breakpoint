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

const unit = {
  id: "unit-content-1",
  nodeId: currentNode.id,
} as UnitContent;

const masteredRun = {
  unitId: unit.id,
  sessionId: "session-1",
  userId: "user-1",
  recipeVersion: "education-unit-v1",
  phase: "mastered",
  pass: 2,
  connectGrills: 0,
  solveRepairs: 0,
  scenarioSpec: null,
  difficultySnapshot: null,
} satisfies PersistedUnitRun;

describe("advanceCompletedUnitWorkflow", () => {
  it("commits immediately and mints the next unit in the background", async () => {
    const events: string[] = [];
    const mintUnit = vi.fn(() => {
      events.push("mint");
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
            touchSession: () => Promise.resolve(),
          });
          events.push("transaction:commit");
          return value;
        },
        mintUnit,
        getMasteryState: () =>
          Effect.succeed({
            uncheckedEntryCount: 3,
            learnerRating: 1200,
            ratingDeviation: 100,
            peakRating: 1600,
            simulationPassed: false,
          }),
        openSimulation: () => Effect.void,
      },
    });

    await vi.waitFor(() => expect(mintUnit).toHaveBeenCalledOnce());

    expect(result).toEqual({
      success: true,
      data: { advanced: true, nextReadyNode: null },
    });
    expect(mintUnit).toHaveBeenCalledWith({
      clusterNodeId: "cluster-1",
      sessionId: "session-1",
      userId: "user-1",
    });
    expect(events).toEqual(["transaction:start", "transaction:commit", "mint"]);
  });

  it("skips the mastery loop quietly for legacy plans without a skill map", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const mintUnit = vi.fn(() => Effect.void);
    const openSimulation = vi.fn(() => Effect.void);

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
            touchSession: () => Promise.resolve(),
          }),
        mintUnit,
        getMasteryState: () => Effect.succeed(null),
        openSimulation,
      },
    });

    await vi.waitFor(() => expect(consoleError).not.toHaveBeenCalled());

    expect(result.success).toBe(true);
    expect(mintUnit).not.toHaveBeenCalled();
    expect(openSimulation).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
