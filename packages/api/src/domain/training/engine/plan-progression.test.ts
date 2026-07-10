import { describe, expect, it } from "vitest";

import type { ProgressionNode } from "./plan-progression";
import {
  decideMasteryProgression,
  planAdvancement,
  planCompletion,
  planSkillMapAdvancement,
  rollUpParentStatus,
  usesDynamicMasteryLoop,
} from "./plan-progression";

const node = (
  overrides: Partial<ProgressionNode> & { id: string },
): ProgressionNode => ({
  parentNodeId: null,
  kind: "unit",
  status: "planned",
  orderIndex: 0,
  ...overrides,
});

describe("usesDynamicMasteryLoop", () => {
  it("keeps legacy and imported units on list advancement", () => {
    expect(
      usesDynamicMasteryLoop({ nodeKind: "unit", parentHasSkillMap: false }),
    ).toBe(false);
  });

  it("routes dynamic skill units through the creation loop", () => {
    expect(
      usesDynamicMasteryLoop({ nodeKind: "unit", parentHasSkillMap: true }),
    ).toBe(true);
  });

  it("keeps legacy simulations on list advancement", () => {
    expect(
      usesDynamicMasteryLoop({
        nodeKind: "simulation",
        parentHasSkillMap: false,
      }),
    ).toBe(false);
  });

  it("routes dynamic skill simulations through the mastery loop", () => {
    expect(
      usesDynamicMasteryLoop({
        nodeKind: "simulation",
        parentHasSkillMap: true,
      }),
    ).toBe(true);
  });
});

describe("decideMasteryProgression", () => {
  it("foundation: keeps creating units while any concept is under-covered", () => {
    expect(
      decideMasteryProgression({
        regime: "foundation",
        entries: [{ coverageCount: 3 }, { coverageCount: 2 }],
        coverageTarget: 3,
      }),
    ).toEqual({ intent: "create_unit" });
  });

  it("foundation: masters the skill once every concept reaches the target", () => {
    expect(
      decideMasteryProgression({
        regime: "foundation",
        entries: [{ coverageCount: 3 }, { coverageCount: 4 }],
        coverageTarget: 3,
      }),
    ).toEqual({ intent: "node_complete" });
  });

  it("foundation: an empty concept map is never mastered", () => {
    expect(
      decideMasteryProgression({
        regime: "foundation",
        entries: [],
        coverageTarget: 3,
      }),
    ).toEqual({ intent: "create_unit" });
  });

  it("skillset: keeps creating units while knowledge remains unchecked", () => {
    expect(
      decideMasteryProgression({
        regime: "skillset",
        uncheckedEntryCount: 1,
        learnerRating: 1700,
        ratingDeviation: 40,
        peakRating: 1600,
      }),
    ).toEqual({ intent: "create_unit" });
  });

  it("skillset: keeps creating units until peak performance is stable", () => {
    expect(
      decideMasteryProgression({
        regime: "skillset",
        uncheckedEntryCount: 0,
        learnerRating: 1600,
        ratingDeviation: 120,
        peakRating: 1600,
      }),
    ).toEqual({ intent: "create_unit" });
  });

  it("skillset: masters the ability after the rating gate passes", () => {
    expect(
      decideMasteryProgression({
        regime: "skillset",
        uncheckedEntryCount: 0,
        learnerRating: 1650,
        ratingDeviation: 60,
        peakRating: 1600,
      }),
    ).toEqual({ intent: "node_complete" });
  });
});

describe("planSkillMapAdvancement", () => {
  const tree = [
    node({ id: "root", kind: "root", status: "completed" }),
    node({
      id: "ability-1",
      kind: "ability",
      parentNodeId: "root",
      status: "ready",
      orderIndex: 1,
    }),
    node({
      id: "skill-1",
      kind: "skill",
      parentNodeId: "ability-1",
      status: "ready",
      orderIndex: 2,
    }),
    node({
      id: "skill-2",
      kind: "skill",
      parentNodeId: "ability-1",
      status: "planned",
      orderIndex: 3,
    }),
    node({
      id: "ability-2",
      kind: "ability",
      parentNodeId: "root",
      status: "planned",
      orderIndex: 4,
    }),
    node({
      id: "skill-3",
      kind: "skill",
      parentNodeId: "ability-2",
      status: "planned",
      orderIndex: 5,
    }),
  ];

  it("a mastered skill unlocks the next sibling skill's foundation unit", () => {
    const advancement = planSkillMapAdvancement(tree, "skill-1");
    expect(advancement).toMatchObject({
      kind: "foundation_unit",
      skillNodeId: "skill-2",
    });
    expect(advancement.changes).toContainEqual({
      nodeId: "skill-1",
      status: "completed",
    });
    expect(advancement.changes).toContainEqual({
      nodeId: "skill-2",
      status: "ready",
    });
  });

  it("a mastered skill mid-track emits no stage change", () => {
    expect(planSkillMapAdvancement(tree, "skill-1").stageChanges).toEqual([]);
  });

  it("the last mastered skill opens the ability's skillset units", () => {
    const allButLast = tree.map((item) =>
      item.id === "skill-1" ? { ...item, status: "completed" as const } : item,
    );
    const advancement = planSkillMapAdvancement(allButLast, "skill-2");
    expect(advancement).toMatchObject({
      kind: "skillset_unit",
      abilityNodeId: "ability-1",
    });
    // The unlock is recorded explicitly — nothing may infer it from status.
    expect(advancement.stageChanges).toContainEqual({
      nodeId: "ability-1",
      stage: "skillset",
    });
  });

  it("a mastered ability unlocks the next ability's first skill", () => {
    const advancement = planSkillMapAdvancement(tree, "ability-1");
    expect(advancement).toMatchObject({
      kind: "foundation_unit",
      skillNodeId: "skill-3",
    });
    expect(advancement.changes).toContainEqual({
      nodeId: "ability-2",
      status: "ready",
    });
    expect(advancement.stageChanges).toContainEqual({
      nodeId: "ability-1",
      stage: "mastered",
    });
    expect(advancement.stageChanges).toContainEqual({
      nodeId: "ability-2",
      stage: "foundations",
    });
  });

  it("does not skip an already-completed immediate successor on replay", () => {
    const replayed = [
      ...tree.map((item) =>
        item.id === "skill-1" || item.id === "skill-2"
          ? { ...item, status: "completed" as const }
          : item,
      ),
      node({
        id: "skill-4",
        kind: "skill",
        parentNodeId: "ability-1",
        status: "planned",
        orderIndex: 6,
      }),
    ];

    expect(planSkillMapAdvancement(replayed, "skill-1")).toMatchObject({
      kind: "none",
    });
  });

  it("does not reset a progressed first skill when an ability advance is replayed", () => {
    const replayed = tree.map((item) =>
      item.id === "skill-3"
        ? { ...item, status: "completed" as const }
        : item,
    );

    expect(planSkillMapAdvancement(replayed, "ability-1")).toMatchObject({
      kind: "none",
    });
  });

  it("the last mastered ability completes the plan", () => {
    const lastAbility = tree.map((item) =>
      item.id === "ability-1"
        ? { ...item, status: "completed" as const }
        : item,
    );
    expect(planSkillMapAdvancement(lastAbility, "ability-2")).toMatchObject({
      kind: "plan_complete",
    });
  });
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
