import { redirect } from "next/navigation";

import { ForgeWorkspace } from "~/features/becoming/components/forge/forge-workspace";
import { getForgeUnit } from "~/features/becoming/server/becoming-queries";

export default async function TrainUnitPage(props: {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ unitId }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const sessionId = searchParams.session;

  if (!sessionId) {
    redirect("/onboarding");
  }

  const unit = await getForgeUnit({ nodeId: unitId, sessionId });

  return <ForgeWorkspace unit={unit} sessionId={sessionId} />;
}
