import type { ClusterBriefing } from "./types/training.types";

export const generateClusterBriefing = async ({
  slotKind,
  totalSlots,
  clusterContext,
  completedClusterTitles,
}: {
  slotKind: "unit" | "integration";
  totalSlots: number;
  clusterContext: {
    title: string;
    summary: string;
    whyItMatters: string;
  };
  completedClusterTitles?: string[];
}): Promise<ClusterBriefing> => {
  const slots = slotKind === "integration" ? "integration steps" : "units";
  const completedContext = completedClusterTitles?.length
    ? ` It builds on ${completedClusterTitles.join(", ")}.`
    : "";

  return Promise.resolve({
    briefingArc: `${clusterContext.title} is a ${totalSlots}-${slots} sequence about ${clusterContext.summary} The order moves from recognizing the work to making the judgment under realistic pressure, so each step supplies a piece the next one needs.${completedContext}`,
    briefingMap: Array.from({ length: totalSlots }, (_, index) => ({
      position: index + 1,
      role:
        index === 0
          ? "Establishes the first useful move in the workflow."
          : index === totalSlots - 1
            ? "Combines the earlier moves into a complete piece of judgment."
            : "Adds a constraint that makes the earlier move more realistic.",
    })),
  });
};
