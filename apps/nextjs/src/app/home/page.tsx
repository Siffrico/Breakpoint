import { redirect } from "next/navigation";

import { HomeShell } from "~/features/becoming/components/home-shell";
import {
  getActivePlan,
  getForgeUnit,
  getHomeState,
} from "~/features/becoming/server/becoming-queries";

export default async function HomeWorkspacePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session;

  if (!sessionId) {
    redirect("/onboarding");
  }

  const home = await getHomeState(sessionId);

  const [plan, unit] = await Promise.all([
    getActivePlan(sessionId),
    home.nextUnitId
      ? getForgeUnit({ nodeId: home.nextUnitId, sessionId }).catch(() => null)
      : Promise.resolve(null),
  ]);

  // If mid-unit (not at the scenario start step), send them to the dedicated train page
  if (unit && unit.currentStep !== "scenario") {
    redirect(`/train/${home.nextUnitId}?session=${sessionId}`);
  }

  return (
    <HomeShell
      home={home}
      plan={plan}
      unit={unit}
      sessionId={sessionId}
    />
  );
}
