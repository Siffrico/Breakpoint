import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

import { getSession } from "~/auth/server";
import { WorkspaceShell } from "~/features/training/components/workspace-shell";
import {
  getChatHistory,
  getWorkspaceShell,
} from "~/features/training/server/training-queries";
import { TRPCReactProvider } from "~/trpc/react";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

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

  const shell = await getWorkspaceShell({
    sessionId: asSessionCandidate(session),
    cookieSessionId: asSessionCandidate(
      cookieStore.get(LAST_SESSION_COOKIE)?.value,
    ),
  });
  if (shell.kind === "needs-onboarding") {
    redirect("/onboarding");
  }
  if (shell.kind === "onboarding") {
    return (
      <TRPCReactProvider>
        <WorkspaceShell
          plan={null}
          onboardingState={shell.onboardingState}
          projects={shell.projects}
          sessionId={shell.sessionId}
          userName={authSession.user.name}
        />
      </TRPCReactProvider>
    );
  }

  // A `chat` param that points at anything other than the live node opens that
  // chat's read-only transcript. The live node (or a bad id) falls through to
  // the normal workspace so the plain URL stays the single live view. During a
  // recall interlude the live node differs from nextUnitId; the client detects
  // that from aiWorkspace and swaps the transcript back to the live view.
  const chatHistory =
    chat && chat !== shell.plan.nextUnitId
      ? await getChatHistory({
          nodeId: chat,
          sessionId: shell.sessionId,
        }).catch(() => null)
      : null;

  // History views render a static transcript: the unit query stays disabled
  // client-side and aiWorkspace loads lazily only to classify the live node,
  // so prefetching either here would block-free but wastefully re-read the
  // heaviest projections on every transcript visit.
  if (!chatHistory) {
    prefetch(
      trpc.training.aiWorkspace.queryOptions({ sessionId: shell.sessionId }),
    );
  }

  return (
    <TRPCReactProvider>
      <HydrateClient>
        <WorkspaceShell
          plan={shell.plan}
          onboardingState={null}
          projects={shell.projects}
          sessionId={shell.sessionId}
          chatHistory={chatHistory}
          userName={authSession.user.name}
        />
      </HydrateClient>
    </TRPCReactProvider>
  );
}
