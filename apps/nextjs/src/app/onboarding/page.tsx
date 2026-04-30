import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { OnboardingShell } from "~/features/becoming/components/onboarding-shell";

export default async function OnboardingPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth");
  }

  return <OnboardingShell />;
}
