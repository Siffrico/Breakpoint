import { describe, expect, it, vi } from "vitest";

import type { CurriculumNode, CurriculumPlan } from "../types/training.types";
import { getProjectTopicWorkflow } from "./get-project-topic-workflow";

const makeNode = (overrides: Partial<CurriculumNode>): CurriculumNode => ({
  id: "node",
  parentNodeId: null,
  kind: "outcome",
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
  it("returns only outcomes, joined to ratings, with unrated outcomes null", async () => {
    const plan = makePlan([
      makeNode({ id: "outcome-a", kind: "outcome", title: "A" }),
      makeNode({ id: "outcome-b", kind: "outcome", title: "B" }),
      makeNode({ id: "unit-1", kind: "unit", title: "Unit" }),
    ]);
    const getJobProgress = vi.fn().mockResolvedValue([
      {
        nodeId: "outcome-a",
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

    // Only outcomes are rated; units are excluded.
    expect(result.data.outcomes.map((ability) => ability.nodeId)).toEqual([
      "outcome-a",
      "outcome-b",
    ]);
    // Progress read is scoped to the outcome nodes only.
    expect(getJobProgress).toHaveBeenCalledWith(["outcome-a", "outcome-b"]);
    // Rated outcome carries its Glicko state; an unrated outcome is null.
    expect(result.data.outcomes[0]).toMatchObject({
      rating: 1240,
      ratingDeviation: 85,
    });
    expect(result.data.outcomes[1]).toMatchObject({
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
