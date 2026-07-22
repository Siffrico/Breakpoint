import type { Result } from "../../../lib/result";
import type {
  CurriculumPlan,
  OnboardingSessionState,
} from "../types/training.types";
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

export type WorkspaceShell =
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
    };

interface WorkspaceShellDependencies {
  listProjects: () => Promise<LearningProjectSummary[]>;
  ownsSession: (sessionId: string) => Promise<boolean>;
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  getOnboardingState: (
    sessionId: string,
  ) => Promise<OnboardingSessionState | null>;
}

/**
 * Takes requested and cookie session candidates plus shell reads, produces the
 * selected workspace shell, and fails only when ownership or readiness fails.
 */
export const getWorkspaceShellWorkflow = async ({
  sessionId,
  cookieSessionId,
  deps,
}: {
  sessionId?: string;
  cookieSessionId?: string;
  deps: WorkspaceShellDependencies;
}): Promise<Result<WorkspaceShell>> => {
  const projectsPromise = deps.listProjects();
  const ownershipPromise = sessionId
    ? deps.ownsSession(sessionId)
    : Promise.resolve(null);
  const [projects, requestedSessionOwned] = await Promise.all([
    projectsPromise,
    ownershipPromise,
  ]);

  if (requestedSessionOwned === false) {
    return err("Learning project does not exist.");
  }

  const cookieProject = cookieSessionId
    ? projects.find((project) => project.sessionId === cookieSessionId)
    : null;
  const resolvedSessionId =
    sessionId ?? cookieProject?.sessionId ?? projects[0]?.sessionId ?? null;
  if (!resolvedSessionId) {
    return ok({ kind: "needs-onboarding", projects });
  }

  const [plan, onboardingState] = await Promise.all([
    deps.getActivePlan(resolvedSessionId),
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

  return ok({
    kind: "workspace",
    sessionId: resolvedSessionId,
    projects,
    plan,
  });
};
