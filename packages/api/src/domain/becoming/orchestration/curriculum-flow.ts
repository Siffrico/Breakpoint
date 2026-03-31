import type {
  CurriculumBlueprint,
  CurriculumNodeBlueprint,
  OnboardingTranscriptMessage,
} from "../types/becoming.types";
import { createOnboardingPacket } from "./onboarding-flow";
import { designCurriculum } from "../agents/curriculum-designer";

const buildNodes = (
  draft: Awaited<ReturnType<typeof designCurriculum>>["planDraft"],
  targetIdentity: string,
  headline: string,
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
      title: targetIdentity,
      summary: headline,
      whyItMatters: "This path exists because of the operator the learner wants to become.",
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
    const clusterHasInitiallyReadyUnit = unitNumber < 1;

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
        status: unitNumber <= 1 ? "ready" : "planned",
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

export const generateCurriculumBlueprint = async (
  transcript: OnboardingTranscriptMessage[],
): Promise<{
  report: Awaited<ReturnType<typeof designCurriculum>>["identityReport"];
  beforeAfter: Awaited<ReturnType<typeof designCurriculum>>["beforeAfter"];
  blueprint: CurriculumBlueprint;
}> => {
  const packet = await createOnboardingPacket(transcript);
  const design = await designCurriculum({
    packet,
    transcript,
  });

  return {
    report: design.identityReport,
    beforeAfter: design.beforeAfter,
    blueprint: {
      title: design.planDraft.title,
      summary: design.planDraft.summary,
      targetIdentity: design.planDraft.targetIdentity,
      nodes: buildNodes(
        design.planDraft,
        design.identityReport.targetIdentity,
        design.identityReport.headline,
      ),
      beforeAfter: design.beforeAfter,
    },
  };
};
