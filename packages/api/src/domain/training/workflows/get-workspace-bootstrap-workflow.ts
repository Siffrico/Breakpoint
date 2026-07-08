import type { Result } from "../../../lib/result";
import type {
  CurriculumPlan,
  EducationUnitState,
  HomeState,
  OnboardingSessionState,
} from "../types/training.types";
import type { UnitNotReadyError } from "../unit-preparation/errors";
import type { AiWorkspaceView } from "./get-ai-workspace-workflow";
import { err, ok } from "../../../lib/result";

export interface LearningProjectSummary {
  sessionId: string;
  title: string;
  headline: string;
  status: "active" | "building" | "onboarding";
  lessonPreview: {
    id: string;
    title: string;
    status: string;
  }[];
  updatedAt: Date;
}

export type WorkspaceBootstrap =
  | {
      kind: "needs-onboarding";
      projects: LearningProjectSummary[];
    }
  | {
      kind: "onboarding";
      sessionId: string;
      projects: LearningProjectSummary[];
      onboardingState: OnboardingSessionState;
    }
  | {
      kind: "workspace";
      sessionId: string;
      projects: LearningProjectSummary[];
      plan: CurriculumPlan;
      workspace: HomeState;
      aiWorkspace: AiWorkspaceView | null;
      unit: EducationUnitState | null;
      activeNodeId: string | null;
      preparingNodeId: string | null;
    };

interface WorkspaceBootstrapDependencies {
  listProjects: () => Promise<LearningProjectSummary[]>;
  ownsSession: (sessionId: string) => Promise<boolean>;
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  getHomeState: (sessionId: string) => Promise<HomeState | null>;
  getAiWorkspace: (
    sessionId: string,
  ) => Promise<Result<AiWorkspaceView, string | UnitNotReadyError>>;
  getOnboardingState: (
    sessionId: string,
  ) => Promise<OnboardingSessionState | null>;
  getUnit: (
    sessionId: string,
    nodeId: string,
  ) => Promise<Result<EducationUnitState>>;
}

export const getWorkspaceBootstrapWorkflow = async ({
  sessionId,
  cookieSessionId,
  deps,
}: {
  sessionId?: string;
  cookieSessionId?: string;
  deps: WorkspaceBootstrapDependencies;
}): Promise<Result<WorkspaceBootstrap, string | UnitNotReadyError>> => {
  const projectsPromise = deps.listProjects();
  const requestedSessionOwned = sessionId
    ? await deps.ownsSession(sessionId)
    : null;
  if (requestedSessionOwned === false) {
    return err("Learning project does not exist.");
  }

  const projects = await projectsPromise;
  const cookieProject = cookieSessionId
    ? projects.find((project) => project.sessionId === cookieSessionId)
    : null;
  const resolvedSessionId =
    sessionId ?? cookieProject?.sessionId ?? projects[0]?.sessionId ?? null;
  if (!resolvedSessionId) {
    return ok({ kind: "needs-onboarding", projects });
  }

  const [plan, workspace, aiWorkspaceResult, onboardingState] =
    await Promise.all([
      deps.getActivePlan(resolvedSessionId),
      deps.getHomeState(resolvedSessionId),
      deps.getAiWorkspace(resolvedSessionId),
      deps.getOnboardingState(resolvedSessionId),
    ]);

  if (!plan) {
    return onboardingState
      ? ok({
          kind: "onboarding",
          sessionId: resolvedSessionId,
          projects,
          onboardingState,
        })
      : err("Learning project is not ready.");
  }
  if (!workspace) {
    return err("Learning workspace is not ready.");
  }

  const aiWorkspace = aiWorkspaceResult.success ? aiWorkspaceResult.data : null;
  const aiWorkspaceFailure = aiWorkspaceResult.success
    ? null
    : aiWorkspaceResult.error;
  if (typeof aiWorkspaceFailure === "string") {
    return err(aiWorkspaceFailure);
  }

  const preparingNodeId = aiWorkspaceFailure?.nodeId ?? null;
  const activeNodeId =
    aiWorkspace?.state?.recallUnitId ??
    aiWorkspace?.state?.activeUnitId ??
    preparingNodeId ??
    workspace.nextUnitId ??
    plan.nextUnitId;
  const activeNode = activeNodeId
    ? (plan.nodes.find((node) => node.id === activeNodeId) ?? null)
    : null;
  const unitResult =
    aiWorkspace &&
    activeNode &&
    activeNode.kind !== "simulation" &&
    (activeNode.kind === "unit" || activeNode.kind === "integration")
      ? await deps.getUnit(resolvedSessionId, activeNode.id)
      : null;

  return ok({
    kind: "workspace",
    sessionId: resolvedSessionId,
    projects,
    plan,
    workspace,
    aiWorkspace,
    unit: unitResult?.success ? unitResult.data : null,
    activeNodeId: activeNodeId ?? null,
    preparingNodeId,
  });
};
