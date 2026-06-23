import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Set up your Breakpoint learning path.",
};

import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { OnboardingShell } from "~/features/training/components/onboarding-shell";
import { TRPCReactProvider } from "~/trpc/react";
import { getQueryClient, trpc } from "~/trpc/server";

export default async function OnboardingPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth");
  }

  // Resume the latest in-progress session (rendered into first paint) so a
  // reload or idle tab continues the same transcript instead of resetting.
  const initialState = await getQueryClient().fetchQuery(
    trpc.training.resumeOnboarding.queryOptions(),
  );

  return (
    <TRPCReactProvider>
      <OnboardingShell initialState={initialState} />
    </TRPCReactProvider>
  );
}
