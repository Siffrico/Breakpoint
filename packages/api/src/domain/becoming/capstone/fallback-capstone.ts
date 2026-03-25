import type { CapstoneScenario } from "./types/capstone.types";

export const getCapstoneMaxRounds = (format: CapstoneScenario["format"]) =>
  format === "build" ? 2 : 3;

export const buildFallbackTeachCapstone = ({
  clusterTitle,
  clusterSummary,
  whyItMatters,
}: {
  clusterTitle: string;
  clusterSummary: string;
  whyItMatters: string;
}): CapstoneScenario => ({
  format: "teach",
  title: `${clusterTitle} under pressure`,
  audience: "a skeptical colleague",
  audienceContext:
    "They think this cluster sounds smart in theory but weak in real execution.",
  deliveryGoal:
    "Explain the cluster's core operating insight clearly enough that they would actually change how they work.",
  openingQuestion: `Why does ${clusterTitle} matter in practice, and not just as a nice idea? Use this context if helpful: ${clusterSummary} ${whyItMatters}`,
});
