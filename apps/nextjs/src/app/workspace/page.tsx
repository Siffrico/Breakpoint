import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { WorkspaceShell } from "~/features/becoming/components/workspace-shell";
import {
  getActivePlan,
  getCapstone,
  getForgeUnit,
  getOnboardingState,
  getRecallGate,
  getWorkspaceState,
  listLearningProjects,
} from "~/features/becoming/server/becoming-queries";

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
  const resolvedSessionId = session ?? cookieSessionId ?? projects[0]?.sessionId ?? null;

  if (!resolvedSessionId) {
    redirect("/onboarding");
  }

  if (!session && resolvedSessionId) {
    redirect(`/workspace?session=${resolvedSessionId}`);
  }

  const plan = await getActivePlan(resolvedSessionId).catch(() => null);

  if (!plan) {
    const onboardingState = await getOnboardingState(resolvedSessionId).catch(() => null);

    if (!onboardingState) {
      redirect("/onboarding");
    }

    return (
      <WorkspaceShell
        workspace={null}
        plan={null}
        unit={null}
        capstone={null}
        onboardingState={onboardingState}
        recallGate={null}
        projects={projects}
        sessionId={resolvedSessionId}
        userName={authSession.user.name ?? undefined}
      />
    );
  }

  const workspace = await getWorkspaceState(resolvedSessionId);
  const activeRecallGate = await getRecallGate({ sessionId: resolvedSessionId }).catch(
    () => null,
  );
  const activeNodeId = workspace.nextUnitId ?? plan.nextUnitId;
  const activeNode = activeNodeId
    ? plan.nodes.find((node) => node.id === activeNodeId) ?? null
    : null;

  const [unit, capstone] = await Promise.all([
    activeNode && activeNode.kind !== "simulation"
      ? getForgeUnit({ nodeId: activeNode.id, sessionId: resolvedSessionId }).catch(
          () => null,
        )
      : Promise.resolve(null),
    activeNode?.kind === "simulation"
      ? getCapstone({ nodeId: activeNode.id, sessionId: resolvedSessionId }).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);

  return (
    <WorkspaceShell
      workspace={workspace}
      plan={plan}
      unit={unit}
      capstone={capstone}
      onboardingState={null}
      recallGate={activeRecallGate}
      projects={projects}
      sessionId={resolvedSessionId}
    />
  );
}
