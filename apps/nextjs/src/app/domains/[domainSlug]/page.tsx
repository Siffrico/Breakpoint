import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { ScenarioWorkspace } from "~/features/esde/components/scenario-workspace";
import { getActiveScenario } from "~/features/esde/server/esde-queries";

export default async function DomainScenarioPage(props: {
  params: Promise<{ domainSlug: string }>;
}) {
  const { domainSlug } = await props.params;

  try {
    const scenario = await getActiveScenario(domainSlug);
    return <ScenarioWorkspace scenario={scenario} />;
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }
}
