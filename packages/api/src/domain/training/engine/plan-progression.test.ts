import { describe, expect, it } from "vitest";

import type { ProgressionNode } from "./plan-progression";
import {
  decideMasteryProgression,
  planAdvancement,
  planCompletion,
  rollUpParentStatus,
  usesMintedMasteryLoop,
} from "./plan-progression";

describe("usesMintedMasteryLoop", () => {
  it("keeps legacy and imported units on list advancement", () => {
    expect(
      usesMintedMasteryLoop({ nodeKind: "unit", parentHasSkillMap: false }),
    ).toBe(false);
  });

  it("routes dynamic skill units through minting", () => {
    expect(
      usesMintedMasteryLoop({ nodeKind: "unit", parentHasSkillMap: true }),
    ).toBe(true);
  });

  it("keeps legacy simulations on list advancement", () => {
    expect(
      usesMintedMasteryLoop({
        nodeKind: "simulation",
        parentHasSkillMap: false,
      }),
    ).toBe(false);
  });

  it("routes dynamic skill simulations through the mastery loop", () => {
    expect(
      usesMintedMasteryLoop({
        nodeKind: "simulation",
        parentHasSkillMap: true,
      }),
    ).toBe(true);
  });
});

describe("decideMasteryProgression", () => {
  it("keeps minting while knowledge remains unchecked", () => {
    expect(
      decideMasteryProgression({
        uncheckedEntryCount: 1,
        learnerRating: 1700,
        ratingDeviation: 40,
        peakRating: 1600,
        simulationPassed: false,
      }),
    ).toEqual({ intent: "mint" });
  });

  it("keeps minting until peak performance is stable", () => {
    expect(
      decideMasteryProgression({
        uncheckedEntryCount: 0,
        learnerRating: 1600,
        ratingDeviation: 120,
        peakRating: 1600,
        simulationPassed: false,
      }),
    ).toEqual({ intent: "mint" });
  });

  it("opens the simulation only after syllabus and rating gates pass", () => {
    expect(
      decideMasteryProgression({
        uncheckedEntryCount: 0,
        learnerRating: 1650,
        ratingDeviation: 60,
        peakRating: 1600,
        simulationPassed: false,
      }),
    ).toEqual({ intent: "simulation" });
  });

  it("completes the cluster after the simulation passes", () => {
    expect(
      decideMasteryProgression({
        uncheckedEntryCount: 0,
        learnerRating: 1650,
        ratingDeviation: 60,
        peakRating: 1600,
        simulationPassed: true,
      }),
    ).toEqual({ intent: "cluster_complete" });
  });
});

const node = (
  overrides: Partial<ProgressionNode> & { id: string },
): ProgressionNode => ({
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
  node({
    id: "cluster",
    kind: "skill_cluster",
    status: statuses.cluster ?? "ready",
    orderIndex: 1,
  }),
  node({
    id: "unitA",
    parentNodeId: "cluster",
    status: statuses.unitA ?? "ready",
    orderIndex: 2,
  }),
  node({
    id: "unitB",
    parentNodeId: "cluster",
    status: statuses.unitB ?? "planned",
    orderIndex: 3,
  }),
  node({
    id: "simulation",
    parentNodeId: "cluster",
    kind: "simulation",
    status: statuses.simulation ?? "planned",
    orderIndex: 4,
  }),
  node({
    id: "integration",
    kind: "integration",
    status: statuses.integration ?? "planned",
    orderIndex: 5,
  }),
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
      buildPlan({
        unitA: "completed",
        unitB: "ready",
        simulation: "completed",
      }),
      "unitB",
    );

    expect(changes).toContainEqual({ nodeId: "cluster", status: "completed" });
  });

  it("returns nothing for an unknown node", () => {
    expect(planCompletion(buildPlan({}), "missing")).toEqual([]);
  });

  it("omits a no-op parent write when the parent already has the rolled-up status", () => {
    const changes = planCompletion(
      buildPlan({ unitA: "ready", cluster: "ready" }),
      "unitA",
    );

    expect(changes).toEqual([{ nodeId: "unitA", status: "completed" }]);
  });
});

describe("planAdvancement", () => {
  it("unlocks the cluster simulation once every unit is complete", () => {
    const plan = buildPlan({ unitA: "completed", unitB: "completed" });

    const result = planAdvancement(plan, "unitB");

    expect(result.advancedNodeId).toBe("simulation");
    expect(result.changes).toContainEqual({
      nodeId: "simulation",
      status: "ready",
    });
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
    const plan = buildPlan({
      unitA: "completed",
      unitB: "ready",
      simulation: "planned",
    });

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
