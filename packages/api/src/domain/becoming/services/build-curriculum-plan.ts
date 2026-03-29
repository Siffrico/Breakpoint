import type {
  BeforeAfterProfile,
  CurriculumBlueprint,
  CurriculumNodeBlueprint,
  IdentityReport,
} from "../types/becoming.types";
import { generateBecomingObject } from "../generate-becoming-object";
import { getBecomingModel } from "./becoming-model";
import { z } from "zod/v4";

const CurriculumDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  targetIdentity: z.string().min(1),
  clusters: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
        unitCount: z.number().int().min(1).max(6),
        simulation: z.object({
          title: z.string().min(1),
          summary: z.string().min(1),
          whyItMatters: z.string().min(1),
        }),
      }),
    )
    .min(1)
    .max(7),
  integrationLayers: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
        unitCount: z.number().int().min(1).max(4),
        clusterSynthesis: z.array(z.string().min(1)).min(2),
      }),
    )
    .max(6),
});

const buildNodes = (
  draft: z.infer<typeof CurriculumDraftSchema>,
  report: IdentityReport,
): CurriculumNodeBlueprint[] => {
  const maxUnitsPerCluster = Math.max(
    ...draft.clusters.map((cluster) => cluster.unitCount),
    1,
  );
  const clusterSpan = maxUnitsPerCluster + 2;
  const totalClusterWidth = Math.max(draft.clusters.length * clusterSpan - 1, 1);
  const integrationStartColumn = totalClusterWidth + 2;

  const nodes: CurriculumNodeBlueprint[] = [
    {
      parentOrderIndex: null,
      kind: "root",
      status: "completed",
      title: report.targetIdentity,
      summary: report.headline,
      whyItMatters: "This path exists because of the operator the user wants to become.",
      orderIndex: 0,
      depth: 0,
      positionColumn: Math.floor(totalClusterWidth / 2),
      positionRow: 0,
    },
  ];

  let orderIndex = 1;
  let unitNumber = 0;

  draft.clusters.forEach((cluster, clusterIndex) => {
    const clusterOrderIndex = orderIndex++;
    const baseColumn = clusterIndex * clusterSpan;
    const clusterCenter = baseColumn + Math.floor((cluster.unitCount - 1) / 2);
    const clusterHasInitiallyReadyUnit = unitNumber < 2;

    nodes.push({
      parentOrderIndex: 0,
      kind: "skill_cluster",
      status: clusterHasInitiallyReadyUnit ? "ready" : "planned",
      title: cluster.title,
      summary: cluster.summary,
      whyItMatters: cluster.whyItMatters,
      orderIndex: clusterOrderIndex,
      depth: 1,
      positionColumn: clusterCenter,
      positionRow: 1,
    });

    Array.from({ length: cluster.unitCount }).forEach((_, unitIndex) => {
      unitNumber += 1;
      nodes.push({
        parentOrderIndex: clusterOrderIndex,
        kind: "unit",
        status: unitNumber <= 2 ? "ready" : "planned",
        title: `Unit Slot ${unitIndex + 1}`,
        summary: `Generated when the learner reaches slot ${unitIndex + 1} in ${cluster.title}.`,
        whyItMatters: cluster.whyItMatters,
        orderIndex: orderIndex++,
        depth: 2,
        positionColumn: baseColumn + unitIndex,
        positionRow: 2,
      });
    });

    nodes.push({
      parentOrderIndex: clusterOrderIndex,
      kind: "simulation",
      status: "planned",
      title: cluster.simulation.title,
      summary: cluster.simulation.summary,
      whyItMatters: cluster.simulation.whyItMatters,
      orderIndex: orderIndex++,
      depth: 3,
      positionColumn: clusterCenter,
      positionRow: 3,
    });
  });

  draft.integrationLayers.forEach((layer, layerIndex) => {
    const layerOrderIndex = orderIndex++;

    nodes.push({
      parentOrderIndex: 0,
      kind: "skill_cluster",
      status: "planned",
      title: layer.title,
      summary: layer.summary,
      whyItMatters: `${layer.whyItMatters} Combines ${layer.clusterSynthesis.join(", ")}.`,
      orderIndex: layerOrderIndex,
      depth: 1,
      positionColumn: integrationStartColumn + layerIndex,
      positionRow: 1,
    });

    Array.from({ length: layer.unitCount }).forEach((_, slotIndex) => {
      nodes.push({
        parentOrderIndex: layerOrderIndex,
        kind: "integration",
        status: "planned",
        title: `Integration Slot ${slotIndex + 1}`,
        summary: `Generated when the learner reaches integration slot ${slotIndex + 1}. Combines ${layer.clusterSynthesis.join(", ")}.`,
        whyItMatters: layer.whyItMatters,
        orderIndex: orderIndex++,
        depth: 2,
        positionColumn: integrationStartColumn + layerIndex,
        positionRow: 2 + slotIndex,
      });
    });
  });

  return nodes;
};

export const buildCurriculumPlan = async (
  report: IdentityReport,
  beforeAfter: BeforeAfterProfile,
): Promise<CurriculumBlueprint> => {
  const model = getBecomingModel();
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated curriculum architecture.");
  }

  const object = await generateBecomingObject({
    modelName: process.env.OPENAI_MODEL,
    schema: CurriculumDraftSchema,
    errorMessage: "Failed to generate the curriculum architecture.",
    system:
      "You design adaptive training curricula for an identity-driven product. Convert ambition into a pressure-tested path. Think in terms of operator capability, judgment, behavior under stress, and measurable progression.",
    prompt: `Design a curriculum skeleton for this learner.

Requirements:
- Return between 1 and 7 skill clusters, based on the learner and domain complexity.
- Each cluster should specify unitCount instead of predefining unit titles or lesson topics.
- Each cluster must include one capstone simulation object that pressure-tests that cluster's skills.
- integrationLayers should describe cross-cluster bridge layers only when they are needed.
- Each integration layer should specify unitCount instead of predefining integration lessons.
- Curriculum creation is skeleton-only. Do not predefine unit titles, unit summaries, or lesson content.
- Build for the person they want to become, not a generic course buyer.
- The path should move through cluster skill-building, then a simulation for that cluster, then onward to the next cluster, with integration work only after the cluster work is complete.
- Keep the language crisp, not academic or motivational.
- clusterSynthesis should name the cluster titles being combined.
- Do not use filler clusters or filler slots just to make the path look complete. Fewer stronger nodes is better than padded curriculum.

Identity report:
Target identity: ${report.targetIdentity}
Headline: ${report.headline}
Motivation: ${report.motivation}
Current baseline: ${report.currentBaseline}
Proof of progress: ${report.proofOfProgress}
Hard moments: ${report.hardMoments.join("; ")}
Constraints: ${report.constraints.join("; ") || "None provided"}
Behavior signals: ${report.behaviorSignals.join("; ")}

Before/after reveal:
Headline: ${beforeAfter.headline}
Before summary: ${beforeAfter.beforeSummary}
After summary: ${beforeAfter.afterSummary}
Contrast pairs: ${beforeAfter.contrastPairs
      .map((pair) => `${pair.before} -> ${pair.after}`)
      .join("; ")}
First shift: ${beforeAfter.firstShift}`,
  });

  return {
    title: object.title,
    summary: object.summary,
    targetIdentity: object.targetIdentity,
    nodes: buildNodes(object, report),
    beforeAfter,
  };
};
