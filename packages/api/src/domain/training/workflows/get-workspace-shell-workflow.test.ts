import { describe, expect, it, vi } from "vitest";

import type { CurriculumPlan } from "../types/training.types";
import { getWorkspaceShellWorkflow } from "./get-workspace-shell-workflow";

const requestedSessionId = "00000000-0000-0000-0000-000000000001";
const cookieSessionId = "00000000-0000-0000-0000-000000000002";
const newestSessionId = "00000000-0000-0000-0000-000000000003";
const nodeId = "00000000-0000-0000-0000-000000000004";

const createProject = (sessionId: string, updatedAt: string) => ({
  sessionId,
  title: "Systems engineering",
  headline: "Operate under production constraints",
  status: "active" as const,
  lessonPreview: [],
  updatedAt: new Date(updatedAt),
});

const requestedProject = createProject(
  requestedSessionId,
  "2026-01-01T00:00:00.000Z",
);
const cookieProject = createProject(
  cookieSessionId,
  "2026-01-02T00:00:00.000Z",
);
const newestProject = createProject(
  newestSessionId,
  "2026-01-03T00:00:00.000Z",
);

const plan = {
  id: "00000000-0000-0000-0000-000000000005",
  title: requestedProject.title,
  summary: requestedProject.headline,
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

const onboardingState = {
  sessionId: requestedSessionId,
  phase: "intro" as const,
  transcript: [],
  activeQuestion: null,
};

const createDependencies = () => ({
  listProjects: vi.fn().mockResolvedValue([requestedProject]),
  ownsSession: vi.fn().mockResolvedValue(true),
  getActivePlan: vi.fn().mockResolvedValue(plan),
  getOnboardingState: vi.fn().mockResolvedValue(null),
});

describe("getWorkspaceShellWorkflow", () => {
  it("rejects an unowned requested session before reading shell state", async () => {
    const deps = createDependencies();
    deps.ownsSession.mockResolvedValue(false);

    const result = await getWorkspaceShellWorkflow({
      sessionId: requestedSessionId,
      deps,
    });

    expect(result).toEqual({
      success: false,
      error: "Learning project does not exist.",
    });
    expect(deps.listProjects).toHaveBeenCalledOnce();
    expect(deps.getActivePlan).not.toHaveBeenCalled();
    expect(deps.getOnboardingState).not.toHaveBeenCalled();
  });

  it("falls back to the cookie project when no session is requested", async () => {
    const deps = createDependencies();
    deps.listProjects.mockResolvedValue([newestProject, cookieProject]);

    const result = await getWorkspaceShellWorkflow({
      cookieSessionId,
      deps,
    });

    expect(result.success).toBe(true);
    expect(deps.ownsSession).not.toHaveBeenCalled();
    expect(deps.getActivePlan).toHaveBeenCalledWith(cookieSessionId);
    expect(deps.getOnboardingState).toHaveBeenCalledWith(cookieSessionId);
  });

  it("falls back to the newest project when no candidate matches", async () => {
    const deps = createDependencies();
    deps.listProjects.mockResolvedValue([newestProject, cookieProject]);

    const result = await getWorkspaceShellWorkflow({
      cookieSessionId: requestedSessionId,
      deps,
    });

    expect(result.success).toBe(true);
    expect(deps.getActivePlan).toHaveBeenCalledWith(newestSessionId);
    expect(deps.getOnboardingState).toHaveBeenCalledWith(newestSessionId);
  });

  it("returns needs-onboarding when the learner has no projects", async () => {
    const deps = createDependencies();
    deps.listProjects.mockResolvedValue([]);

    const result = await getWorkspaceShellWorkflow({ deps });

    expect(result).toEqual({
      success: true,
      data: { kind: "needs-onboarding", projects: [] },
    });
    expect(deps.getActivePlan).not.toHaveBeenCalled();
    expect(deps.getOnboardingState).not.toHaveBeenCalled();
  });

  it("returns the onboarding variant when the project has no plan", async () => {
    const deps = createDependencies();
    deps.getActivePlan.mockResolvedValue(null);
    deps.getOnboardingState.mockResolvedValue(onboardingState);

    const result = await getWorkspaceShellWorkflow({
      sessionId: requestedSessionId,
      deps,
    });

    expect(result).toEqual({
      success: true,
      data: {
        kind: "onboarding",
        sessionId: requestedSessionId,
        projects: [requestedProject],
        onboardingState,
      },
    });
  });
});
