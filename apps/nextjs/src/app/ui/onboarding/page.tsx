import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding preview",
  description: "Preview the Breakpoint onboarding flow.",
};

import { OnboardingShell } from "~/features/training/components/onboarding-shell";

export default function UiPreviewOnboardingPage() {
  return <OnboardingShell preview />;
}
