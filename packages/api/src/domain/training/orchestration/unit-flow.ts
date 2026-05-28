import type {
  ForgeUnitContent,
  PreSeedUnitContentDraft,
} from "../types/training.types";
import type { PracticePrompt } from "../types/training.types";
import type { StageTeachbackSetup } from "../unit-builder/contracts";
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

export const generateUnitLesson = ({
  nodeId,
  slotKind,
  slotIndex,
  totalSlots,
  clusterContext,
  integrationContext,
  targetIdentity,
  priorLearning,
  seedResponse,
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
  seedResponse: string;
  currentUnit: ForgeUnitContent;
}): Promise<{
  buildContent: string;
  practicePrompts: PracticePrompt[];
  teachbackSetup: StageTeachbackSetup;
}> =>
  educationUnitBuilder.buildAndProve({
    nodeId,
    slotKind,
    slotIndex,
    totalSlots,
    clusterContext,
    integrationContext,
    targetIdentity,
    priorLearning,
    seedResponse,
    currentUnit,
  }).then(({ build, prove }) => ({
    buildContent: build.buildContent,
    practicePrompts: prove.practicePrompts,
    teachbackSetup: prove.teachbackSetup,
  }));
