import { redirect } from "next/navigation";

import { UnitWorkspace } from "~/features/becoming/components/unit-workspace";
import { getUnit } from "~/features/becoming/server/becoming-queries";

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

  const unit = await getUnit(unitId);

  return <UnitWorkspace unit={unit} sessionId={sessionId} />;
}
