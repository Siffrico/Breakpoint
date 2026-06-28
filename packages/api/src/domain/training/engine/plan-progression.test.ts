import { describe, expect, it } from "vitest";

import type { ProgressionNode } from "./plan-progression";
import {
  planAdvancement,
  planCompletion,
  rollUpParentStatus,
} from "./plan-progression";

const node = (overrides: Partial<ProgressionNode> & { id: string }): ProgressionNode => ({
  parentNodeId: null,
  kind: "unit",
  status: "planned",
  orderIndex: 0,
  ...overrides,
});

/**
 * A single cluster with two units and a simulation, plus a trailing integration
 * layer. Order indexes mirror how `buildCurriculumNodes` lays a plan out.
 */
const buildPlan = (statuses: {
  unitA?: ProgressionNode["status"];
  unitB?: ProgressionNode["status"];
  simulation?: ProgressionNode["status"];
  cluster?: ProgressionNode["status"];
  integration?: ProgressionNode["status"];
}): ProgressionNode[] => [
  node({ id: "cluster", kind: "skill_cluster", status: statuses.cluster ?? "ready", orderIndex: 1 }),
  node({ id: "unitA", parentNodeId: "cluster", status: statuses.unitA ?? "ready", orderIndex: 2 }),
  node({ id: "unitB", parentNodeId: "cluster", status: statuses.unitB ?? "planned", orderIndex: 3 }),
  node({ id: "simulation", parentNodeId: "cluster", kind: "simulation", status: statuses.simulation ?? "planned", orderIndex: 4 }),
  node({ id: "integration", kind: "integration", status: statuses.integration ?? "planned", orderIndex: 5 }),
];

describe("rollUpParentStatus", () => {
  it("returns null when there are no children", () => {
    expect(rollUpParentStatus([])).toBeNull();
  });

  it("is completed only when every child is completed", () => {
    expect(
      rollUpParentStatus([{ status: "completed" }, { status: "completed" }]),
    ).toBe("completed");
  });

  it("is ready when any child is ready or completed", () => {
    expect(
      rollUpParentStatus([{ status: "completed" }, { status: "planned" }]),
    ).toBe("ready");
  });

  it("is planned when no child has started", () => {
    expect(
      rollUpParentStatus([{ status: "planned" }, { status: "planned" }]),
    ).toBe("planned");
  });
});

describe("planCompletion", () => {
  it("marks the node completed and rolls its parent up to ready", () => {
    const changes = planCompletion(
      buildPlan({ unitA: "ready", cluster: "planned" }),
      "unitA",
    );

    expect(changes).toContainEqual({ nodeId: "unitA", status: "completed" });
    expect(changes).toContainEqual({ nodeId: "cluster", status: "ready" });
  });

  it("rolls the parent up to completed once its last child completes", () => {
    const changes = planCompletion(
      buildPlan({ unitA: "completed", unitB: "ready", simulation: "completed" }),
      "unitB",
    );

    expect(changes).toContainEqual({ nodeId: "cluster", status: "completed" });
  });

  it("returns nothing for an unknown node", () => {
    expect(planCompletion(buildPlan({}), "missing")).toEqual([]);
  });

  it("omits a no-op parent write when the parent already has the rolled-up status", () => {
    const changes = planCompletion(buildPlan({ unitA: "ready", cluster: "ready" }), "unitA");

    expect(changes).toEqual([{ nodeId: "unitA", status: "completed" }]);
  });
});

describe("planAdvancement", () => {
  it("unlocks the cluster simulation once every unit is complete", () => {
    const plan = buildPlan({ unitA: "completed", unitB: "completed" });

    const result = planAdvancement(plan, "unitB");

    expect(result.advancedNodeId).toBe("simulation");
    expect(result.changes).toContainEqual({ nodeId: "simulation", status: "ready" });
  });

  it("unlocks the next planned unit while units remain", () => {
    const plan = buildPlan({ unitA: "completed" });

    const result = planAdvancement(plan, "unitA");

    expect(result.advancedNodeId).toBe("unitB");
    expect(result.changes).toContainEqual({ nodeId: "unitB", status: "ready" });
  });

  it("unlocks an integration layer only after every unit is complete", () => {
    const plan = buildPlan({
      unitA: "completed",
      unitB: "completed",
      simulation: "completed",
    });

    const result = planAdvancement(plan, "simulation");

    expect(result.advancedNodeId).toBe("integration");
  });

  it("does not advance while a unit is still in progress and nothing is unlockable", () => {
    // unitB is `ready` (in progress, not planned), so no planned unit remains to
    // unlock and the integration gate is still closed.
    const plan = buildPlan({ unitA: "completed", unitB: "ready", simulation: "planned" });

    const result = planAdvancement(plan, "unitA");

    expect(result).toEqual({ advancedNodeId: null, changes: [] });
  });

  it("returns nothing for an unknown node", () => {
    expect(planAdvancement(buildPlan({}), "missing")).toEqual({
      advancedNodeId: null,
      changes: [],
    });
  });
});
