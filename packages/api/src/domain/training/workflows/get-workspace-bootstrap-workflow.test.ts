import { describe, expect, it, vi } from "vitest";

import type { CurriculumPlan, HomeState } from "../types/training.types";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { getWorkspaceBootstrapWorkflow } from "./get-workspace-bootstrap-workflow";

const sessionId = "00000000-0000-0000-0000-000000000001";
const nodeId = "00000000-0000-0000-0000-000000000002";
const project = {
  sessionId,
  title: "Systems engineering",
  headline: "Operate under production constraints",
  status: "active" as const,
  lessonPreview: [],
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const plan = {
  id: "00000000-0000-0000-0000-000000000003",
  title: project.title,
  summary: project.headline,
  targetIdentity: "Systems engineer",
  overview: null,
  beforeAfter: {
    headline: "Systems engineer",
    beforeSummary: "Before",
    afterSummary: "After",
    contrastPairs: [],
    firstShift: "Diagnose",
  },
  nodes: [
    {
      id: nodeId,
      parentNodeId: null,
      kind: "unit",
      title: "Diagnose saturation",
      summary: "Find the bottleneck",
      whyItMatters: "Latency compounds",
      learningGoal: "Diagnose saturation",
      orderIndex: 0,
      depth: 0,
      positionColumn: 0,
      positionRow: 0,
      status: "ready",
      difficultyBands: null,
    },
  ],
  nextUnitId: nodeId,
} satisfies CurriculumPlan;
const workspace = {
  targetIdentity: plan.targetIdentity,
  headline: project.headline,
  planTitle: plan.title,
  planSummary: plan.summary,
  completedUnits: 0,
  totalUnits: 1,
  nextUnitId: nodeId,
  nextUnitTitle: plan.nodes[0]?.title ?? null,
  blockingSignals: [],
  lastCompletedUnit: null,
  demonstratedCapabilities: [],
  nodeScores: {},
} satisfies HomeState;

const createDependencies = () => ({
  listProjects: vi.fn().mockResolvedValue([project]),
  ownsSession: vi.fn().mockResolvedValue(true),
  getActivePlan: vi.fn().mockResolvedValue(plan),
  getHomeState: vi.fn().mockResolvedValue(workspace),
  getAiWorkspace: vi.fn().mockResolvedValue({
    success: false as const,
    error: new UnitNotReadyError({ message: "UNIT_PREPARING", nodeId }),
  }),
  getOnboardingState: vi.fn().mockResolvedValue(null),
  getUnit: vi.fn(),
});

describe("getWorkspaceBootstrapWorkflow", () => {
  it("returns a distinct state when the learner has no projects", async () => {
    const deps = createDependencies();
    deps.listProjects.mockResolvedValue([]);

    const result = await getWorkspaceBootstrapWorkflow({ deps });

    expect(result).toEqual({
      success: true,
      data: { kind: "needs-onboarding", projects: [] },
    });
    expect(deps.getActivePlan).not.toHaveBeenCalled();
  });

  it("rejects an unowned requested session before reading workspace data", async () => {
    const deps = createDependencies();
    deps.ownsSession.mockResolvedValue(false);

    const result = await getWorkspaceBootstrapWorkflow({ sessionId, deps });

    expect(result).toEqual({
      success: false,
      error: "Learning project does not exist.",
    });
    expect(deps.getActivePlan).not.toHaveBeenCalled();
    expect(deps.getAiWorkspace).not.toHaveBeenCalled();
  });

  it("preserves the active node while its unit is preparing", async () => {
    const deps = createDependencies();

    const result = await getWorkspaceBootstrapWorkflow({ sessionId, deps });

    expect(result.success).toBe(true);
    if (!result.success || result.data.kind !== "workspace") return;
    expect(result.data.activeNodeId).toBe(nodeId);
    expect(result.data.preparingNodeId).toBe(nodeId);
    expect(result.data.unit).toBeNull();
    expect(deps.getUnit).not.toHaveBeenCalled();
  });

  it("starts independent workspace projections together", async () => {
    const deps = createDependencies();
    let resolvePlan: (value: CurriculumPlan) => void = () => undefined;
    let resolveHome: (value: HomeState) => void = () => undefined;
    let resolveAi: (
      value: Awaited<ReturnType<typeof deps.getAiWorkspace>>,
    ) => void = () => undefined;
    let resolveOnboarding: (value: null) => void = () => undefined;
    deps.getActivePlan.mockImplementation(
      () => new Promise((resolve) => (resolvePlan = resolve)),
    );
    deps.getHomeState.mockImplementation(
      () => new Promise((resolve) => (resolveHome = resolve)),
    );
    deps.getAiWorkspace.mockImplementation(
      () => new Promise((resolve) => (resolveAi = resolve)),
    );
    deps.getOnboardingState.mockImplementation(
      () => new Promise((resolve) => (resolveOnboarding = resolve)),
    );

    const resultPromise = getWorkspaceBootstrapWorkflow({ sessionId, deps });
    await vi.waitFor(() => {
      expect(deps.getActivePlan).toHaveBeenCalledOnce();
      expect(deps.getHomeState).toHaveBeenCalledOnce();
      expect(deps.getAiWorkspace).toHaveBeenCalledOnce();
      expect(deps.getOnboardingState).toHaveBeenCalledOnce();
    });

    resolvePlan(plan);
    resolveHome(workspace);
    resolveAi({
      success: false,
      error: new UnitNotReadyError({ message: "UNIT_PREPARING", nodeId }),
    });
    resolveOnboarding(null);
    await resultPromise;
  });
});
