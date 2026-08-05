import { describe, expect, it } from "vitest";

import type { ProgressionNode } from "./plan-progression";
import {
  decideMasteryProgression,
  planSkillMapAdvancement,
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
  it("keeps units without a skill map out of the mastery loop", () => {
    expect(
      usesDynamicMasteryLoop({ nodeKind: "unit", parentHasSkillMap: false }),
    ).toBe(false);
  });

  it("routes dynamic skill units through the creation loop", () => {
    expect(
      usesDynamicMasteryLoop({ nodeKind: "unit", parentHasSkillMap: true }),
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

  it("skillset: a settled rating alone never masters — reps are the other gate", () => {
    expect(
      decideMasteryProgression({
        regime: "skillset",
        skillsBelowRepTarget: 1,
        learnerRating: 1700,
        ratingDeviation: 40,
        masteryRating: 1600,
      }),
    ).toEqual({ intent: "create_unit" });
  });

  it("skillset: reps alone never master either — the rating must settle", () => {
    expect(
      decideMasteryProgression({
        regime: "skillset",
        skillsBelowRepTarget: 0,
        learnerRating: 1600,
        ratingDeviation: 120,
        masteryRating: 1600,
      }),
    ).toEqual({ intent: "create_unit" });
  });

  it("skillset: masters the ability once both gates pass", () => {
    expect(
      decideMasteryProgression({
        regime: "skillset",
        skillsBelowRepTarget: 0,
        learnerRating: 1650,
        ratingDeviation: 60,
        masteryRating: 1600,
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
      item.id === "skill-3" ? { ...item, status: "completed" as const } : item,
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

describe("main_outcome mastery gate", () => {
  const settled = {
    regime: "main_outcome" as const,
    syllabusItemsBelowCoverage: 0,
    learnerRating: 1400,
    ratingDeviation: 60,
    masteryRating: 1350,
  };

  it("completes only when syllabus breadth and rating depth both hold", () => {
    expect(decideMasteryProgression(settled)).toEqual({
      intent: "node_complete",
    });
  });

  it("keeps going while any syllabus entry is uncovered, however high the rating", () => {
    expect(
      decideMasteryProgression({
        ...settled,
        syllabusItemsBelowCoverage: 1,
        learnerRating: 2000,
      }),
    ).toEqual({ intent: "create_unit" });
  });

  it("keeps going while the rating is short, however complete the coverage", () => {
    expect(
      decideMasteryProgression({ ...settled, learnerRating: 1200 }),
    ).toEqual({ intent: "create_unit" });
  });

  it("keeps going while the rating is unsettled at the target", () => {
    expect(
      decideMasteryProgression({ ...settled, ratingDeviation: 150 }),
    ).toEqual({ intent: "create_unit" });
  });

  it("honours a contract that narrows the deviation ceiling", () => {
    expect(
      decideMasteryProgression({
        ...settled,
        ratingDeviation: 60,
        maxRatingDeviation: 40,
      }),
    ).toEqual({ intent: "create_unit" });
  });
});

describe("planSkillMapAdvancement for outcome nodes", () => {
  const outcomeTree = (
    statuses: Record<string, ProgressionNode["status"]>,
  ): ProgressionNode[] => [
    node({ id: "root", kind: "root", status: "completed" }),
    ...["outcome-1", "outcome-2", "outcome-3"].map((id, index) =>
      node({
        id,
        kind: "outcome",
        parentNodeId: "root",
        status: statuses[id] ?? "planned",
        orderIndex: index + 1,
      }),
    ),
  ];

  it("completes the mastered outcome and opens the next one", () => {
    const advancement = planSkillMapAdvancement(
      outcomeTree({ "outcome-1": "ready" }),
      "outcome-1",
    );

    expect(advancement.kind).toBe("outcome_unit");
    expect(advancement).toMatchObject({ outcomeNodeId: "outcome-2" });
    expect(advancement.changes).toEqual([
      { nodeId: "outcome-1", status: "completed" },
      { nodeId: "outcome-2", status: "ready" },
    ]);
  });

  it("adds no status change when the next outcome is already open", () => {
    // An interleaved plan unlocks every outcome at build time, so the next one
    // only has to become the node the following unit hangs off.
    const advancement = planSkillMapAdvancement(
      outcomeTree({
        "outcome-1": "ready",
        "outcome-2": "ready",
        "outcome-3": "ready",
      }),
      "outcome-1",
    );

    expect(advancement).toMatchObject({
      kind: "outcome_unit",
      outcomeNodeId: "outcome-2",
    });
    expect(advancement.changes).toEqual([
      { nodeId: "outcome-1", status: "completed" },
    ]);
  });

  it("skips outcomes that are already completed", () => {
    const advancement = planSkillMapAdvancement(
      outcomeTree({
        "outcome-1": "ready",
        "outcome-2": "completed",
      }),
      "outcome-1",
    );

    expect(advancement).toMatchObject({ outcomeNodeId: "outcome-3" });
  });

  it("completes the plan when the last outcome masters", () => {
    const advancement = planSkillMapAdvancement(
      outcomeTree({
        "outcome-1": "completed",
        "outcome-2": "completed",
        "outcome-3": "ready",
      }),
      "outcome-3",
    );

    expect(advancement.kind).toBe("plan_complete");
  });

  it("completes the plan for a single-outcome topic", () => {
    const advancement = planSkillMapAdvancement(
      [
        node({ id: "root", kind: "root", status: "completed" }),
        node({
          id: "outcome-1",
          kind: "outcome",
          parentNodeId: "root",
          status: "ready",
          orderIndex: 1,
        }),
      ],
      "outcome-1",
    );

    expect(advancement.kind).toBe("plan_complete");
  });
});
