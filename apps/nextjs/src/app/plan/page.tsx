import { redirect } from "next/navigation";

import { CurriculumReveal } from "~/features/becoming/components/curriculum-reveal";
import { getActivePlan } from "~/features/becoming/server/becoming-queries";

export default async function PlanPage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session;

  if (!sessionId) {
    redirect("/onboarding");
  }

  const plan = await getActivePlan(sessionId);

  return <CurriculumReveal plan={plan} sessionId={sessionId} />;
}
