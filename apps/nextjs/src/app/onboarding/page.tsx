import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { OnboardingShell } from "~/features/training/components/onboarding-shell";
import { TRPCReactProvider } from "~/trpc/react";
import { getQueryClient, trpc } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Set up your Breakpoint learning path.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    session?: string;
  }>;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth");
  }

  const params = await searchParams;
  const initialState = params.session
    ? await getQueryClient().fetchQuery(
        trpc.training.onboardingState.queryOptions({
          sessionId: params.session,
        }),
      )
    : null;

  // Manual/imported projects do not have a streamed build card to restore.
  // Their useful recovery destination is the workspace, not an empty chat.
  if (
    initialState?.phase === "ready_for_generation" &&
    !initialState.projectBuild
  ) {
    redirect(
      `/workspace?session=${encodeURIComponent(initialState.sessionId)}`,
    );
  }

  return (
    <TRPCReactProvider>
      <OnboardingShell
        key={initialState?.sessionId ?? "new"}
        initialState={initialState}
      />
    </TRPCReactProvider>
  );
}
