import type { Metadata } from "next";

import { OnboardingShell } from "~/features/training/components/onboarding-shell";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Onboarding preview",
  description: "Preview the Breakpoint onboarding flow.",
};

export default function UiPreviewOnboardingPage() {
  return (
    <TRPCReactProvider>
      <OnboardingShell preview />
    </TRPCReactProvider>
  );
}
