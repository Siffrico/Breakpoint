import { describe, expect, it, vi } from "vitest";

import type { CurriculumNode, CurriculumPlan } from "../types/training.types";
import { getProjectTopicWorkflow } from "./get-project-topic-workflow";

const makeNode = (overrides: Partial<CurriculumNode>): CurriculumNode => ({
  id: "node",
  parentNodeId: null,
  kind: "ability",
  title: "Cluster",
  summary: "Cluster summary",
  whyItMatters: "Because",
  learningGoal: "Goal",
  orderIndex: 0,
  depth: 1,
  positionColumn: 0,
  positionRow: 0,
  status: "planned",
  difficultyBands: null,
  ...overrides,
});

const makePlan = (nodes: CurriculumNode[]): CurriculumPlan =>
  ({
    id: "plan-1",
    title: "Machine Learning",
    summary: "summary",
    targetIdentity: "Staff ML engineer",
    overview: null,
    nodes,
    nextUnitId: null,
  }) as unknown as CurriculumPlan;

describe("getProjectTopicWorkflow", () => {
  it("returns only abilities, joined to ratings, with unrated abilities null", async () => {
    const plan = makePlan([
      makeNode({ id: "ability-a", kind: "ability", title: "A" }),
      makeNode({ id: "ability-b", kind: "ability", title: "B" }),
      makeNode({ id: "unit-1", kind: "unit", title: "Unit" }),
    ]);
    const getJobProgress = vi.fn().mockResolvedValue([
      {
        nodeId: "ability-a",
        rating: 1240,
        ratingDeviation: 85,
        lastRatedAt: new Date("2026-06-01T00:00:00Z"),
      },
    ]);

    const result = await getProjectTopicWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(plan),
        getProjectOverview: () => Promise.resolve(null),
        getJobProgress,
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Only abilities are rated; units are excluded.
    expect(result.data.abilities.map((ability) => ability.nodeId)).toEqual([
      "ability-a",
      "ability-b",
    ]);
    // Progress read is scoped to the ability nodes only.
    expect(getJobProgress).toHaveBeenCalledWith(["ability-a", "ability-b"]);
    // Rated ability carries its Glicko state; an unrated ability is null.
    expect(result.data.abilities[0]).toMatchObject({ rating: 1240, ratingDeviation: 85 });
    expect(result.data.abilities[1]).toMatchObject({
      rating: null,
      ratingDeviation: null,
      lastRatedAt: null,
    });
  });

  it("fails when the plan does not exist", async () => {
    const result = await getProjectTopicWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(null),
        getProjectOverview: vi.fn(),
        getJobProgress: vi.fn(),
      },
    });

    expect(result).toEqual({
      success: false,
      error: "Curriculum plan does not exist yet.",
    });
  });
});
