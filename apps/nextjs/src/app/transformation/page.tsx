import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transformation",
  description: "Review your Breakpoint transformation plan.",
};

import { redirect } from "next/navigation";

import { TransformationReveal } from "~/features/training/components/transformation-reveal";
import { getActivePlan } from "~/features/training/server/training-queries";

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
