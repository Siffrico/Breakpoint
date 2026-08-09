import { describe, expect, it } from "vitest";

import type { ProgressionNode } from "./plan-progression";
import {
  decideMasteryProgression,
  planSkillMapAdvancement,
  shouldWarmNextOutcome,
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

const progress = {
  regime: "main_outcome" as const,
  skillItemsBelowCoverage: 0,
  skillItemsTotal: 10,
  learnerRating: 1400,
  ratingDeviation: 60,
  masteryRating: 1350,
};

describe("outcome mastery", () => {
  it("uses the dynamic loop only for units whose outcome has a Skill Map", () => {
    expect(
      usesDynamicMasteryLoop({ nodeKind: "unit", parentHasSkillMap: true }),
    ).toBe(true);
    expect(
      usesDynamicMasteryLoop({ nodeKind: "unit", parentHasSkillMap: false }),
    ).toBe(false);
  });

  it("requires both Skill Map coverage and a settled mastery rating", () => {
    expect(decideMasteryProgression(progress)).toEqual({
      intent: "node_complete",
    });
    expect(
      decideMasteryProgression({ ...progress, skillItemsBelowCoverage: 1 }),
    ).toEqual({ intent: "create_unit" });
    expect(
      decideMasteryProgression({ ...progress, ratingDeviation: 150 }),
    ).toEqual({ intent: "create_unit" });
  });

  it("prewarms the next outcome near completion", () => {
    expect(
      shouldWarmNextOutcome({
        ...progress,
        skillItemsBelowCoverage: 3,
        learnerRating: 1200,
      }),
    ).toBe(false);
    expect(
      shouldWarmNextOutcome({ ...progress, skillItemsBelowCoverage: 2 }),
    ).toBe(true);
    expect(shouldWarmNextOutcome({ ...progress, skillItemsTotal: 0 })).toBe(
      false,
    );
  });
});

describe("outcome advancement", () => {
  const tree = (secondStatus: ProgressionNode["status"] = "planned") => [
    node({ id: "root", kind: "root", status: "completed" }),
    node({
      id: "outcome-1",
      kind: "outcome",
      parentNodeId: "root",
      status: "ready",
      orderIndex: 1,
    }),
    node({
      id: "outcome-2",
      kind: "outcome",
      parentNodeId: "root",
      status: secondStatus,
      orderIndex: 2,
    }),
  ];

  it("completes the current outcome and opens the next", () => {
    expect(planSkillMapAdvancement(tree(), "outcome-1")).toMatchObject({
      kind: "outcome_unit",
      outcomeNodeId: "outcome-2",
      changes: [
        { nodeId: "outcome-1", status: "completed" },
        { nodeId: "outcome-2", status: "ready" },
      ],
    });
  });

  it("completes the plan after the final outcome", () => {
    expect(
      planSkillMapAdvancement(tree("completed"), "outcome-1"),
    ).toMatchObject({ kind: "plan_complete" });
  });
});
