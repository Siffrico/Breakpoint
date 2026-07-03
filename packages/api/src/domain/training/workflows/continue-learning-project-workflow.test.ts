import { describe, expect, it, vi } from "vitest";

import type { CurriculumPlan } from "../types/training.types";
import { continueLearningProjectWorkflow } from "./continue-learning-project-workflow";

const plan = {
  id: "plan-1",
  title: "Agent systems",
  summary: "Build reliable agents.",
  targetIdentity: "Agent engineer",
  overview: null,
  beforeAfter: {
    headline: "From prototypes to reliable systems",
    beforeSummary: "Builds prototypes.",
    afterSummary: "Ships reliable systems.",
    contrastPairs: [
      { before: "Single calls", after: "Reliable workflows" },
      { before: "Happy paths", after: "Failure recovery" },
      { before: "Demos", after: "Production systems" },
    ],
    firstShift: "Make one call reliable.",
  },
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
  it("prepares the earliest ready education unit", async () => {
    const prepareUnit = vi.fn().mockResolvedValue({
      success: true,
      data: { activeStage: "challenge" },
    });

    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue(plan),
        recoverSkillUnits: vi.fn().mockResolvedValue(undefined),
        prepareUnit,
      },
    });

    expect(prepareUnit).toHaveBeenCalledOnce();
    expect(prepareUnit).toHaveBeenCalledWith({
      nodeId: "unit-ready",
      sessionId: "session-1",
    });
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
    const prepareUnit = vi.fn();
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
        recoverSkillUnits: vi.fn().mockResolvedValue(undefined),
        prepareUnit,
      },
    });

    expect(result).toEqual({
      success: false,
      error: "The next education unit is not ready yet.",
    });
    expect(prepareUnit).not.toHaveBeenCalled();
  });

  it("reports a completed project without preparing content", async () => {
    const prepareUnit = vi.fn();
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
        recoverSkillUnits: vi.fn().mockResolvedValue(undefined),
        prepareUnit,
      },
    });

    expect(result).toEqual({
      success: false,
      error: "This learning project is complete.",
    });
    expect(prepareUnit).not.toHaveBeenCalled();
  });

  it("preserves scenario preparation failures", async () => {
    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: vi.fn().mockResolvedValue(plan),
        recoverSkillUnits: vi.fn().mockResolvedValue(undefined),
        prepareUnit: vi.fn().mockResolvedValue({
          success: false,
          error: "Failed to generate unit setup.",
        }),
      },
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to generate unit setup.",
    });
  });

  it("recovers missing dynamic units before reporting the project blocked", async () => {
    const recoveredPlan = {
      ...plan,
      nodes: plan.nodes.map((node) =>
        node.id === "unit-ready" ? { ...node, status: "ready" as const } : node,
      ),
    };
    const getActivePlan = vi
      .fn()
      .mockResolvedValueOnce({
        ...plan,
        nodes: [],
      })
      .mockResolvedValueOnce(recoveredPlan);
    const recoverSkillUnits = vi.fn().mockResolvedValue(undefined);

    const result = await continueLearningProjectWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan,
        recoverSkillUnits,
        prepareUnit: vi.fn().mockResolvedValue({ success: true, data: {} }),
      },
    });

    expect(recoverSkillUnits).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });
});
