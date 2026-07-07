import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

import { getSession } from "~/auth/server";
import { WorkspaceShell } from "~/features/training/components/workspace-shell";
import {
  getChatHistory,
  getWorkspaceBootstrap,
} from "~/features/training/server/training-queries";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Work through your Breakpoint learning workspace.",
};
export const preferredRegion = "iad1";

const LAST_SESSION_COOKIE = "bp-last-learning-session";

// The search param is user-editable and the cookie can be stale or corrupt.
// The bootstrap input schema rejects non-UUIDs with a request error, so bad
// candidates are dropped here to preserve the fall-through to the newest
// project (or onboarding) instead of surfacing an error page.
const SessionCandidateSchema = z.string().uuid();
const asSessionCandidate = (value: string | undefined) =>
  value !== undefined && SessionCandidateSchema.safeParse(value).success
    ? value
    : undefined;

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

  const bootstrap = await getWorkspaceBootstrap({
    sessionId: asSessionCandidate(session),
    cookieSessionId: asSessionCandidate(
      cookieStore.get(LAST_SESSION_COOKIE)?.value,
    ),
  });
  if (bootstrap.kind === "needs-onboarding") {
    redirect("/onboarding");
  }
  if (bootstrap.kind === "onboarding") {
    return (
      <TRPCReactProvider>
        <WorkspaceShell
          workspace={null}
          plan={null}
          unit={null}
          onboardingState={bootstrap.onboardingState}
          projects={bootstrap.projects}
          sessionId={bootstrap.sessionId}
          userName={authSession.user.name}
        />
      </TRPCReactProvider>
    );
  }

  // A `chat` param that points at anything other than the live node opens that
  // chat's read-only transcript. The live node (or a bad id) falls through to
  // the normal workspace so the plain URL stays the single live view.
  const chatHistory =
    chat && chat !== bootstrap.activeNodeId
      ? await getChatHistory({
          nodeId: chat,
          sessionId: bootstrap.sessionId,
        }).catch(() => null)
      : null;

  return (
    <TRPCReactProvider>
      <WorkspaceShell
        workspace={bootstrap.workspace}
        plan={bootstrap.plan}
        unit={chatHistory ? null : bootstrap.unit}
        onboardingState={null}
        aiWorkspace={chatHistory ? null : bootstrap.aiWorkspace}
        projects={bootstrap.projects}
        sessionId={bootstrap.sessionId}
        chatHistory={chatHistory}
        initialActiveNodeId={bootstrap.activeNodeId}
      />
    </TRPCReactProvider>
  );
}
