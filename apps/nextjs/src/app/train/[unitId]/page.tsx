import { notFound, redirect } from "next/navigation";

import { CapstoneWorkspace } from "~/features/becoming/components/capstone/capstone-workspace";
import { ForgeWorkspace } from "~/features/becoming/components/forge/forge-workspace";
import {
  getActivePlan,
  getCapstone,
  getForgeUnit,
  getRecallGate,
} from "~/features/becoming/server/becoming-queries";

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

  const plan = await getActivePlan(sessionId);
  const node = plan.nodes.find((planNode) => planNode.id === unitId);
  if (!node) {
    notFound();
  }

  if (node.kind === "simulation") {
    const capstone = await getCapstone({ nodeId: unitId, sessionId });

    return <CapstoneWorkspace state={capstone} sessionId={sessionId} />;
  }

  const unit = await getForgeUnit({ nodeId: unitId, sessionId });
  const activeRecallGate = await getRecallGate({ sessionId }).catch(() => null);

  return (
    <ForgeWorkspace
      unit={unit}
      sessionId={sessionId}
      recallGate={
        activeRecallGate?.triggerAfterUnitNodeId === unitId
          ? activeRecallGate
          : null
      }
    />
  );
}
