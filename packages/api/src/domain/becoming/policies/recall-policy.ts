import type { RecallProbeType } from "../types/becoming.types";

export const RECALL_INTERVAL = 3;
export const MIN_RECALL_PROBES = 2;
export const MAX_RECALL_PROBES = 3;

export interface RecallCandidate {
  unitNodeId: string;
  unitTitle: string;
  unitSummary: string;
  clusterNodeId: string | null;
  clusterTitle: string | null;
  orderIndex: number;
  originalScore: number;
  seedResponse: string | null;
  finalArticulation: string | null;
  recallCount: number;
  decayCount: number;
  lastRecallOrderIndex: number | null;
}

export interface RecallProbePlan {
  probeType: RecallProbeType;
  sourceUnitNodeIds: string[];
  primaryUnitNodeId: string;
}

export const shouldTriggerRecallGate = (completedUnitCount: number) =>
  completedUnitCount > 0 && completedUnitCount % RECALL_INTERVAL === 0;

const computeUrgencyScore = ({
  candidate,
  triggerOrderIndex,
}: {
  candidate: RecallCandidate;
  triggerOrderIndex: number;
}) => {
  const unitsSinceLastRecall =
    triggerOrderIndex -
    (candidate.lastRecallOrderIndex ?? candidate.orderIndex);
  const originalWeakness = 100 - candidate.originalScore;
  const decayPressure = candidate.decayCount * 15;
  const neverRecalledBonus = candidate.recallCount === 0 ? 50 : 0;

  return (
    unitsSinceLastRecall * 0.4 +
    originalWeakness * 0.3 +
    decayPressure * 0.2 +
    neverRecalledBonus * 0.1
  );
};

export const selectRecallCandidates = ({
  candidates,
  triggerOrderIndex,
}: {
  candidates: RecallCandidate[];
  triggerOrderIndex: number;
}) => {
  const ranked = [...candidates].sort((left, right) => {
    const leftScore = computeUrgencyScore({
      candidate: left,
      triggerOrderIndex,
    });
    const rightScore = computeUrgencyScore({
      candidate: right,
      triggerOrderIndex,
    });

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.orderIndex - right.orderIndex;
  });

  const clusterCount = new Set(
    ranked.map((candidate) => candidate.clusterNodeId).filter(Boolean),
  ).size;
  const desiredCount =
    clusterCount > 1 || ranked.length >= 5 ? MAX_RECALL_PROBES : MIN_RECALL_PROBES;

  return ranked.slice(0, Math.min(desiredCount, ranked.length));
};

export const buildRecallProbePlan = (
  selectedCandidates: RecallCandidate[],
): RecallProbePlan[] => {
  if (selectedCandidates.length === 0) {
    return [];
  }

  const probePlans: RecallProbePlan[] = [];
  const clusterIds = new Set(
    selectedCandidates
      .map((candidate) => candidate.clusterNodeId)
      .filter((clusterId): clusterId is string => clusterId != null),
  );

  if (clusterIds.size > 1) {
    probePlans.push({
      probeType: "interleave",
      sourceUnitNodeIds: selectedCandidates.map((candidate) => candidate.unitNodeId),
      primaryUnitNodeId: selectedCandidates[0]?.unitNodeId ?? "",
    });
  } else if (selectedCandidates.length >= 3) {
    probePlans.push({
      probeType: "compression",
      sourceUnitNodeIds: selectedCandidates.map((candidate) => candidate.unitNodeId),
      primaryUnitNodeId: selectedCandidates[0]?.unitNodeId ?? "",
    });
  }

  for (const candidate of selectedCandidates) {
    const alreadyCoveredAsPrimary = probePlans.some(
      (plan) => plan.primaryUnitNodeId === candidate.unitNodeId,
    );

    if (alreadyCoveredAsPrimary) {
      continue;
    }

    probePlans.push({
      probeType: "seed_return",
      sourceUnitNodeIds: [candidate.unitNodeId],
      primaryUnitNodeId: candidate.unitNodeId,
    });
  }

  return probePlans.slice(0, Math.max(MIN_RECALL_PROBES, probePlans.length));
};
