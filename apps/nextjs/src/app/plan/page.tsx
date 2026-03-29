import { redirect } from "next/navigation";

import { TransformationReveal } from "~/features/becoming/components/transformation-reveal";
import { getActivePlan } from "~/features/becoming/server/becoming-queries";

// Note: this before/after reveal is the new first onboarding artifact.
// Final visual design should be refined with Claude against the existing design system.
export default async function PlanPage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session;

  if (!sessionId) {
    redirect("/onboarding");
  }

  const plan = await getActivePlan(sessionId);

  return <TransformationReveal plan={plan} sessionId={sessionId} />;
}
