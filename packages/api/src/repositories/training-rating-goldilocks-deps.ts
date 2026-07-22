import type { db as databaseClient } from "@acme/db/client";
import { eq } from "@acme/db";
import { TrainingCurriculumNode } from "@acme/db/schema";

import type {
  RecordEvaluationDependencies,
  ResolveScenarioDirectiveDependencies,
} from "../domain/training/orchestration/goldilocks";
import { resolveScenarioFormat } from "../domain/training/engine/progression-model";
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
  getScenarioAttempt: async ({ scenarioAttemptId, userId, nodeId }) => {
    const [attempt, node] = await Promise.all([
      trainingRatingRepository.getOpenScenarioById({
        db,
        scenarioAttemptId,
        userId,
        nodeId,
      }),
      db.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, nodeId),
      }),
    ]);
    if (!attempt) return null;
    if (!node?.skillMap) {
      throw new Error("Rating ability is missing its scenario contract.");
    }
    const format = resolveScenarioFormat(node.skillMap);
    return {
      ...attempt,
      guessChance:
        format.kind === "mcq" && format.optionCount
          ? 1 / format.optionCount
          : 0,
    };
  },
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
