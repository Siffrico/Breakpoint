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
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth");
  }

  const startNewProject = (await searchParams).new === "1";
  // A normal visit restores even a just-completed build, so reloading before
  // pressing "Start learning" cannot silently create a replacement session.
  // Only the explicit new-project action opts out of restoration.
  const initialState = startNewProject
    ? null
    : await getQueryClient().fetchQuery(
        trpc.training.resumeOnboarding.queryOptions(),
      );

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
      <OnboardingShell initialState={initialState} />
    </TRPCReactProvider>
  );
}
