import type {
  CurriculumBlueprint,
  CurriculumNodeBlueprint,
  OnboardingTranscriptMessage,
} from "../types/training.types";
import { designCurriculum } from "../agents/curriculum-designer";
import { normalizeLearningTrackName } from "../agents/onboarding-chat-agent";
import { designProjectOverview } from "../agents/project-overview";
import { createOnboardingPacket } from "./onboarding-flow";

export const buildCurriculumNodes = (
  draft: Awaited<ReturnType<typeof designCurriculum>>["planDraft"],
  targetIdentity: string,
  headline: string,
): CurriculumNodeBlueprint[] => {
  const maxUnitsPerCluster = Math.max(
    ...draft.clusters.map((cluster) => cluster.units.length),
    1,
  );
  const clusterSpan = maxUnitsPerCluster + 2;
  const totalClusterWidth = Math.max(
    draft.clusters.length * clusterSpan - 1,
    1,
  );
  const integrationStartColumn = totalClusterWidth + 2;

  const nodes: CurriculumNodeBlueprint[] = [
    {
      parentOrderIndex: null,
      kind: "root",
      status: "completed",
      title: targetIdentity,
      summary: headline,
      whyItMatters:
        "This path exists because of the operator the learner wants to become.",
      learningGoal:
        "Use this path to turn the target identity into observable decisions and execution. Each unit should make one part of that operator behavior easier to perform under pressure.",
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
    const clusterCenter =
      baseColumn + Math.floor((cluster.units.length - 1) / 2);
    const clusterHasInitiallyReadyUnit = unitNumber < 1;

    nodes.push({
      parentOrderIndex: 0,
      kind: "skill_cluster",
      status: clusterHasInitiallyReadyUnit ? "ready" : "planned",
      title: cluster.title,
      summary: cluster.summary,
      whyItMatters: cluster.whyItMatters,
      learningGoal:
        "Use this cluster to build the core operating pattern behind this capability. By the end, the learner should handle the cluster's pressure test without relying on surface explanations.",
      orderIndex: clusterOrderIndex,
      depth: 1,
      positionColumn: clusterCenter,
      positionRow: 1,
    });

    cluster.units.forEach((unit, unitIndex) => {
      unitNumber += 1;
      nodes.push({
        parentOrderIndex: clusterOrderIndex,
        kind: "unit",
        status: unitNumber <= 1 ? "ready" : "planned",
        title: unit.title,
        summary: unit.learningGoal,
        whyItMatters: cluster.whyItMatters,
        learningGoal: unit.learningGoal,
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
      learningGoal:
        "Use this simulation to prove the learner can combine the cluster's units in one demanding situation. Passing means they can choose and execute the right moves without being told which concept applies.",
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
      learningGoal:
        "Use this integration layer to combine separate clusters into one operating system. The learner should be able to decide which prior tools matter and coordinate them without treating them as isolated lessons.",
      orderIndex: layerOrderIndex,
      depth: 1,
      positionColumn: integrationStartColumn + layerIndex,
      positionRow: 1,
    });

    layer.units.forEach((unit, slotIndex) => {
      nodes.push({
        parentOrderIndex: layerOrderIndex,
        kind: "integration",
        status: "planned",
        title: unit.title,
        summary: unit.learningGoal,
        whyItMatters: layer.whyItMatters,
        learningGoal: unit.learningGoal,
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
  const [design, overviewResult] = await Promise.all([
    designCurriculum({
      packet,
      transcript,
    }),
    designProjectOverview({
      packet,
      transcript,
    }).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    ),
  ]);
  const overview =
    overviewResult.status === "fulfilled" ? overviewResult.value : null;

  return {
    report: design.identityReport,
    beforeAfter: design.beforeAfter,
    blueprint: {
      title: normalizeLearningTrackName(design.planDraft.title),
      summary: design.planDraft.summary,
      targetIdentity: design.planDraft.targetIdentity,
      overview: overview
        ? {
            ...overview,
            generatedAt: new Date().toISOString(),
          }
        : null,
      nodes: buildCurriculumNodes(
        design.planDraft,
        design.identityReport.targetIdentity,
        design.identityReport.headline,
      ),
      beforeAfter: design.beforeAfter,
    },
  };
};
