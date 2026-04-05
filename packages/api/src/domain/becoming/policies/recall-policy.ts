export const RECALL_MIN_INTERVAL = 3;
export const RECALL_BASE_INTERVAL = 4;
export const RECALL_MAX_INTERVAL = 5;

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

export const getRecallThreshold = (candidate: RecallCandidate) => {
  if (candidate.decayCount > 0 || candidate.originalScore < 75) {
    return RECALL_MIN_INTERVAL;
  }

  if (candidate.originalScore >= 90 && candidate.recallCount > 0) {
    return RECALL_MAX_INTERVAL;
  }

  return RECALL_BASE_INTERVAL;
};

const computeUrgencyScore = ({
  candidate,
  triggerOrderIndex,
}: {
  candidate: RecallCandidate;
  triggerOrderIndex: number;
}) => {
  const lastMeaningfulReview =
    candidate.lastRecallOrderIndex ?? candidate.orderIndex;
  const unitsSinceReview = Math.max(triggerOrderIndex - lastMeaningfulReview, 0);
  const weaknessPressure = 100 - candidate.originalScore;
  const decayPressure = candidate.decayCount * 18;
  const neverRecalledPressure = candidate.recallCount === 0 ? 12 : 0;

  return (
    unitsSinceReview * 1.25 +
    weaknessPressure * 0.45 +
    decayPressure +
    neverRecalledPressure
  );
};

export const selectRecallCandidate = ({
  candidates,
  triggerOrderIndex,
}: {
  candidates: RecallCandidate[];
  triggerOrderIndex: number;
}) =>
  [...candidates].sort((left, right) => {
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
  })[0] ?? null;

export const countNewUnitsSinceLastRecall = ({
  completedLearningUnitOrderIndexes,
  lastRecallTriggerOrderIndex,
}: {
  completedLearningUnitOrderIndexes: number[];
  lastRecallTriggerOrderIndex: number | null;
}) =>
  completedLearningUnitOrderIndexes.filter(
    (orderIndex) =>
      lastRecallTriggerOrderIndex == null || orderIndex > lastRecallTriggerOrderIndex,
  ).length;

export const shouldTriggerRecallUnit = ({
  candidate,
  newUnitsSinceLastRecall,
}: {
  candidate: RecallCandidate | null;
  newUnitsSinceLastRecall: number;
}) => {
  if (!candidate) {
    return false;
  }

  return newUnitsSinceLastRecall >= getRecallThreshold(candidate);
};
