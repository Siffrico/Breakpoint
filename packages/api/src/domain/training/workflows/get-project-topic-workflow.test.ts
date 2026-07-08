import { describe, expect, it, vi } from "vitest";

import type { CurriculumNode, CurriculumPlan } from "../types/training.types";
import { getProjectTopicWorkflow } from "./get-project-topic-workflow";

const makeNode = (overrides: Partial<CurriculumNode>): CurriculumNode => ({
  id: "node",
  parentNodeId: null,
  kind: "skill_cluster",
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
  it("returns only skill clusters, joined to ratings, with unrated clusters null", async () => {
    const plan = makePlan([
      makeNode({ id: "cluster-a", kind: "skill_cluster", title: "A" }),
      makeNode({ id: "cluster-b", kind: "skill_cluster", title: "B" }),
      makeNode({ id: "unit-1", kind: "unit", title: "Unit" }),
    ]);
    const getJobProgress = vi.fn().mockResolvedValue([
      {
        nodeId: "cluster-a",
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

    // Only clusters, unit dropped.
    expect(result.data.clusters.map((c) => c.nodeId)).toEqual([
      "cluster-a",
      "cluster-b",
    ]);
    // Progress read is scoped to the cluster nodes only.
    expect(getJobProgress).toHaveBeenCalledWith(["cluster-a", "cluster-b"]);
    // Rated cluster carries its Glicko state; unrated cluster is null.
    expect(result.data.clusters[0]).toMatchObject({ rating: 1240, ratingDeviation: 85 });
    expect(result.data.clusters[1]).toMatchObject({
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
