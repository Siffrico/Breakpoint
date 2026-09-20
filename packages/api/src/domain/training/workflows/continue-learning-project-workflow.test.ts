import { describe, expect, it, vi } from "vitest";

import type { CurriculumPlan } from "../types/training.types";
import { continueLearningProjectWorkflow } from "./continue-learning-project-workflow";

const plan = {
  id: "plan-1",
  title: "Agent systems",
  summary: "Build reliable agents.",
  targetIdentity: "Agent engineer",
  overview: null,
  nextUnitId: "unit-ready",
  nodes: [
    {
      id: "unit-complete",
      parentNodeId: "cluster-1",
      kind: "unit",
      title: "Completed unit",
      summary: "Completed summary",
      whyItMatters: "Completed rationale",
      learningGoal: "Completed goal",
      orderIndex: 1,
      depth: 2,
      positionColumn: 0,
      positionRow: 0,
      status: "completed",
      difficultyBands: null,
    },
    {
      id: "unit-ready",
      parentNodeId: "cluster-1",
      kind: "unit",
      title: "Ready unit",
      summary: "Ready summary",
      whyItMatters: "Ready rationale",
      learningGoal: "Ready goal",
      orderIndex: 2,
      depth: 2,
      positionColumn: 0,
      positionRow: 1,
      status: "ready",
      difficultyBands: null,
    },
    {
      id: "unit-planned",
      parentNodeId: "cluster-1",
      kind: "unit",
      title: "Planned unit",
      summary: "Planned summary",
      whyItMatters: "Planned rationale",
      learningGoal: "Planned goal",
      orderIndex: 3,
      depth: 2,
      positionColumn: 0,
      positionRow: 2,
      status: "planned",
      difficultyBands: null,
    },
  ],
} satisfies CurriculumPlan;

describe("continueLearningProjectWorkflow", () => {
  it("navigates every active project to its authoritative workspace", async () => {
    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue(plan),
      },
    });

    expect(result).toEqual({
      success: true,
      data: {
        sessionId: "session-1",
        href: "/workspace?session=session-1",
      },
    });
  });

  it("rejects a project whose curriculum is not active", async () => {
    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue(null),
      },
    });

    expect(result).toEqual({
      success: false,
      error: "This project's curriculum is not ready yet.",
    });
  });
});
