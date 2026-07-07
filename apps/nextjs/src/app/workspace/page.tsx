import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { WorkspaceShell } from "~/features/training/components/workspace-shell";
import {
  getActivePlan,
  getChatHistory,
  getEducationUnit,
  getInitialAiWorkspace,
  getOnboardingState,
  getWorkspaceState,
  listLearningProjects,
} from "~/features/training/server/training-queries";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Work through your Breakpoint learning workspace.",
};
export const preferredRegion = "iad1";

const LAST_SESSION_COOKIE = "bp-last-learning-session";

export default async function WorkspacePage(props: {
  searchParams: Promise<{ session?: string; chat?: string }>;
}) {
  const [{ session, chat }, authSession, cookieStore] = await Promise.all([
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
    getInitialAiWorkspace(resolvedSessionId),
  ]);
  const activeNodeId =
    aiWorkspace?.state?.recallUnitId ??
    aiWorkspace?.state?.activeUnitId ??
    workspace.nextUnitId ??
    plan.nextUnitId;
  const activeNode = activeNodeId
    ? (plan.nodes.find((node) => node.id === activeNodeId) ?? null)
    : null;

  // A `chat` param that points at anything other than the live node opens that
  // chat's read-only transcript. The live node (or a bad id) falls through to
  // the normal workspace so the plain URL stays the single live view.
  const chatHistory =
    chat && chat !== activeNodeId
      ? await getChatHistory({
          nodeId: chat,
          sessionId: resolvedSessionId,
        }).catch(() => null)
      : null;

  const unit =
    !chatHistory && aiWorkspace && activeNode && activeNode.kind !== "simulation"
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
        aiWorkspace={chatHistory ? null : aiWorkspace}
        projects={projects}
        sessionId={resolvedSessionId}
        chatHistory={chatHistory}
        initialActiveNodeId={activeNodeId ?? null}
      />
    </TRPCReactProvider>
  );
}
