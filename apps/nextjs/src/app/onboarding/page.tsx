import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Set up your Breakpoint learning path.",
};

import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { OnboardingShell } from "~/features/training/components/onboarding-shell";
import { TRPCReactProvider } from "~/trpc/react";

export default async function OnboardingPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth");
  }

  return (
    <TRPCReactProvider>
      <OnboardingShell />
    </TRPCReactProvider>
  );
}
