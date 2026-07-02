import type { PriorLearningRecord, UnitBuilderContext } from "./contracts";
import { runSeedStage } from "./seed-stage";

const createUnitBuilderContext = ({
  nodeId,
  slotKind,
  slotIndex,
  totalSlots,
  clusterContext,
  integrationContext,
  targetIdentity,
  priorLearning,
  currentUnit,
}: {
  nodeId: string;
  slotKind: "unit" | "integration";
  slotIndex: number;
  totalSlots: number;
  clusterContext: {
    title: string;
    summary: string;
    whyItMatters: string;
  } | null;
  integrationContext: {
    completedClusterTitles: string[];
  } | null;
  targetIdentity: string;
  priorLearning: PriorLearningRecord[];
  currentUnit?: {
    title: string;
    summary: string;
    whyItMatters: string;
  };
}): UnitBuilderContext => ({
  node: {
    id: nodeId,
    kind: slotKind,
    title:
      currentUnit?.title ??
      (slotKind === "integration" ? "Integration Slot" : "Unit Slot"),
    summary:
      currentUnit?.summary ??
      clusterContext?.summary ??
      "Generate the next necessary learning move for this learner.",
    whyItMatters:
      currentUnit?.whyItMatters ??
      clusterContext?.whyItMatters ??
      "This slot exists to create real transfer for the learner.",
    orderIndex: slotIndex,
  },
  planContext: {
    slotIndex,
    totalSlots,
    clusterContext,
    integrationContext,
  },
  learner: {
    targetIdentity,
    priorLearning,
  },
});

export const educationUnitBuilder = {
  seed: ({
    nodeId,
    slotKind,
    slotIndex,
    totalSlots,
    clusterContext,
    integrationContext,
    targetIdentity,
  priorLearning,
  plannedUnit,
}: {
    nodeId: string;
    slotKind: "unit" | "integration";
    slotIndex: number;
    totalSlots: number;
    clusterContext: {
      title: string;
      summary: string;
      whyItMatters: string;
    } | null;
    integrationContext: {
      completedClusterTitles: string[];
    } | null;
    targetIdentity: string;
    priorLearning: PriorLearningRecord[];
    plannedUnit?: {
      title: string;
      summary: string;
      whyItMatters: string;
    };
  }) =>
    runSeedStage(
      createUnitBuilderContext({
        nodeId,
        slotKind,
        slotIndex,
        totalSlots,
        clusterContext,
        integrationContext,
        targetIdentity,
        priorLearning,
        currentUnit: plannedUnit,
      }),
    ),

};
