import { redirect } from "next/navigation";

import { TransformationReveal } from "~/features/becoming/components/transformation-reveal";
import { getActivePlan } from "~/features/becoming/server/becoming-queries";

export default async function TransformationPage(props: {
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
