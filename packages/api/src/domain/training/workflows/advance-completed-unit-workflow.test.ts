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
  difficultySnapshot: null,
} satisfies PersistedUnitRun;

describe("advanceCompletedUnitWorkflow", () => {
  it("returns and prewarms the node made ready by the committed transaction", async () => {
    const events: string[] = [];
    let backgroundTask: Promise<void> | null = null;
    const prewarmUnit = vi.fn(() => {
      events.push("prewarm");
      return Promise.resolve();
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
        prewarmUnit,
        scheduleBackgroundTask: (task) => {
          backgroundTask = task();
        },
      },
    });

    await Promise.resolve(backgroundTask);

    expect(result).toEqual({
      success: true,
      data: { advanced: true, nextReadyNode: nextNode },
    });
    expect(prewarmUnit).toHaveBeenCalledWith({
      node: nextNode,
      sessionId: "session-1",
    });
    expect(events).toEqual([
      "transaction:start",
      "transaction:commit",
      "prewarm",
    ]);
  });
});
