import type { PreSeedUnitContentDraft } from "../types/training.types";
import { educationUnitBuilder } from "../unit-builder/orchestrator";

interface PriorLearningRecord {
  title: string;
  score: number;
  readiness: string;
  finalArticulation: string | null;
  growthDimensions: string[] | null;
  improvements: string[];
  failureTags: string[];
  nextStep: string;
}

export const generateUnitScaffold = ({
  slotKind,
  slotIndex,
  totalSlots,
  clusterContext,
  integrationContext,
  targetIdentity,
  priorLearning,
  nodeId,
  plannedUnit,
}: {
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
  nodeId: string;
  plannedUnit?: {
    title: string;
    summary: string;
    whyItMatters: string;
  };
}): Promise<PreSeedUnitContentDraft> =>
  educationUnitBuilder.seed({
    nodeId,
    slotKind,
    slotIndex,
    totalSlots,
    clusterContext,
    integrationContext,
    targetIdentity,
    priorLearning,
    plannedUnit,
  });
