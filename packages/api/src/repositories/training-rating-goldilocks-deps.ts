import type { db as databaseClient } from "@acme/db/client";

import type {
  ResolveScenarioDirectiveDependencies,
  RecordEvaluationDependencies,
} from "../domain/training/orchestration/goldilocks";
import { trainingRatingRepository } from "./training-rating-repository";

type Database = typeof databaseClient;

export const createTrainingRatingGoldilocksDeps = (
  db: Database,
): ResolveScenarioDirectiveDependencies & RecordEvaluationDependencies => ({
  loadJobProgress: ({ userId, nodeId, initialRatingState }) =>
    trainingRatingRepository.loadJobProgress({
      db,
      userId,
      nodeId,
      initialRatingState,
    }),
  listRecentPredictions: ({ userId, nodeId }) =>
    trainingRatingRepository.listRecentPredictions({
      db,
      userId,
      nodeId,
    }),
  getScenarioAttempt: ({ scenarioAttemptId, userId, nodeId }) =>
    trainingRatingRepository.getOpenScenarioById({
      db,
      scenarioAttemptId,
      userId,
      nodeId,
    }),
  saveEvaluationResult: ({
    userId,
    nodeId,
    scenarioAttemptId,
    result,
    nextProgress,
    masteredAt,
  }) =>
    trainingRatingRepository.saveEvaluationResult({
      db,
      userId,
      nodeId,
      scenarioAttemptId,
      result,
      nextProgress,
      masteredAt,
    }),
});
