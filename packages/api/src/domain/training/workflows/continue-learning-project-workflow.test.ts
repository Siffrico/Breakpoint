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
  it("returns the earliest launch-ready unit without starting preparation", async () => {
    const hasUnitContent = vi.fn().mockResolvedValue(true);
    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue(plan),
        hasUnitContent,
      },
    });

    expect(hasUnitContent).toHaveBeenCalledWith("unit-ready");
    expect(result).toEqual({
      success: true,
      data: {
        sessionId: "session-1",
        nodeId: "unit-ready",
        href: "/workspace?session=session-1",
      },
    });
  });

  it("does not prepare a locked project", async () => {
    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue({
          ...plan,
          nextUnitId: null,
          nodes: plan.nodes.map((node) => ({
            ...node,
            status: node.id === "unit-complete" ? "completed" : "planned",
          })),
        }),
        hasUnitContent: vi.fn().mockResolvedValue(false),
      },
    });

    expect(result).toEqual({
      success: false,
      error: "This project is still preparing its first unit.",
    });
  });

  it("reports a completed project without preparing content", async () => {
    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue({
          ...plan,
          nextUnitId: null,
          nodes: plan.nodes.map((node) => ({
            ...node,
            status: "completed" as const,
          })),
        }),
        hasUnitContent: vi.fn().mockResolvedValue(false),
      },
    });

    expect(result).toEqual({
      success: false,
      error: "This learning project is complete.",
    });
  });

  it("does not hide unit generation inside the learner click", async () => {
    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue({ ...plan, nodes: [] }),
        hasUnitContent: vi.fn().mockResolvedValue(false),
      },
    });

    expect(result).toEqual({
      success: false,
      error: "This project is still preparing its first unit.",
    });
  });

  it("rejects a ready node whose content has not committed", async () => {
    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue(plan),
        hasUnitContent: vi.fn().mockResolvedValue(false),
      },
    });

    expect(result).toEqual({
      success: false,
      error: "This project is still preparing its first unit.",
    });
  });
});
