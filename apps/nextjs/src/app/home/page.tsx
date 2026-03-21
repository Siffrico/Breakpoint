import { redirect } from "next/navigation";

import { HomeOverview } from "~/features/becoming/components/home-overview";
import { getHomeState } from "~/features/becoming/server/becoming-queries";

export default async function HomeWorkspacePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session;

  if (!sessionId) {
    redirect("/onboarding");
  }

  const home = await getHomeState(sessionId);

  return <HomeOverview home={home} sessionId={sessionId} />;
}
