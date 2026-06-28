import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Work through your Breakpoint learning workspace.",
};

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { WorkspaceShell } from "~/features/training/components/workspace-shell";
import {
  getActivePlan,
  getAiWorkspace,
  getEducationUnit,
  getOnboardingState,
  getWorkspaceState,
  listLearningProjects,
} from "~/features/training/server/training-queries";
import { TRPCReactProvider } from "~/trpc/react";

const LAST_SESSION_COOKIE = "bp-last-learning-session";

export default async function WorkspacePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ session }, authSession, cookieStore] = await Promise.all([
    props.searchParams,
    getSession(),
    cookies(),
  ]);

  if (!authSession?.user) {
    redirect("/");
  }

  const projects = await listLearningProjects().catch(() => []);
  const cookieSessionId = cookieStore.get(LAST_SESSION_COOKIE)?.value;
  const resolvedSessionId =
    session ?? cookieSessionId ?? projects[0]?.sessionId ?? null;

  if (!resolvedSessionId) {
    redirect("/onboarding");
  }

  if (!session && resolvedSessionId) {
    redirect(`/workspace?session=${resolvedSessionId}`);
  }

  const plan = await getActivePlan(resolvedSessionId).catch(() => null);

  if (!plan) {
    const onboardingState = await getOnboardingState(resolvedSessionId).catch(
      () => null,
    );

    if (!onboardingState) {
      redirect("/onboarding");
    }

    return (
      <TRPCReactProvider>
        <WorkspaceShell
          workspace={null}
          plan={null}
          unit={null}
          onboardingState={onboardingState}
          projects={projects}
          sessionId={resolvedSessionId}
          userName={authSession.user.name}
        />
      </TRPCReactProvider>
    );
  }

  const [workspace, aiWorkspace] = await Promise.all([
    getWorkspaceState(resolvedSessionId),
    getAiWorkspace(resolvedSessionId).catch(() => null),
  ]);
  const activeNodeId =
    aiWorkspace?.state?.recallUnitId ??
    aiWorkspace?.state?.activeUnitId ??
    workspace.nextUnitId ??
    plan.nextUnitId;
  const activeNode = activeNodeId
    ? (plan.nodes.find((node) => node.id === activeNodeId) ?? null)
    : null;

  const unit =
    activeNode && activeNode.kind !== "simulation"
      ? await getEducationUnit({
          nodeId: activeNode.id,
          sessionId: resolvedSessionId,
        }).catch(() => null)
      : null;

  return (
    <TRPCReactProvider>
      <WorkspaceShell
        workspace={workspace}
        plan={plan}
        unit={unit}
        onboardingState={null}
        aiWorkspace={aiWorkspace}
        projects={projects}
        sessionId={resolvedSessionId}
      />
    </TRPCReactProvider>
  );
}
