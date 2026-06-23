import type { db as databaseClient } from "@acme/db/client";

import type {
  CurriculumNode,
  DifficultyBand,
  UnitContent,
} from "../domain/training/types/training.types";
import type { WorkspaceAiEducationOutput } from "../domain/training/workspace-ai/types";
import type {
  ManualDifficultySignal,
  WorkspaceTurnOrchestrationDependencies,
} from "../domain/training/workspace-ai/workspace-turn-orchestration";
import { createInitialRatingState } from "../domain/training/engine/rating";
import {
  prepareScenarioDirective,
  recordEvaluation,
} from "../domain/training/orchestration/goldilocks";
import { ensureWorkspaceUnit } from "../domain/training/workflows/get-ai-workspace-workflow";
import { memoryRepository } from "./memory-repository";
import { trainingAttemptRepository } from "./training-attempt-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import { createTrainingRatingGoldilocksDeps } from "./training-rating-goldilocks-deps";
import { trainingRatingRepository } from "./training-rating-repository";
import { trainingUnitRunRepository } from "./training-unit-run-repository";

type Database = typeof databaseClient;

export const createWorkspaceTurnRepositoryDeps = (
  db: Database,
): WorkspaceTurnOrchestrationDependencies => ({
  getActivePlan: (sessionId: string) =>
    trainingCurriculumRepository.getActivePlan({ db, sessionId }),
  listMessages: (sessionId: string, slot?: "education_unit" | "recall") =>
    trainingOnboardingRepository.listWorkspaceMessages({
      db,
      sessionId,
      slot,
    }),
  getWorkspaceSummary: (sessionId: string, slot: "education_unit" | "recall") =>
    trainingOnboardingRepository.getWorkspaceSummary({
      db,
      sessionId,
      slot,
    }),
  upsertWorkspaceSummary: (payload) =>
    trainingOnboardingRepository.upsertWorkspaceSummary({
      db,
      ...payload,
    }),
  claimWorkspaceTurn: (payload) =>
    trainingOnboardingRepository.claimWorkspaceTurn({
      db,
      ...payload,
    }),
  appendMessage: (payload) =>
    trainingOnboardingRepository.appendWorkspaceMessage({
      db,
      ...payload,
    }),
  listMessagesByTurnId: (sessionId: string, turnId: string) =>
    trainingOnboardingRepository.listWorkspaceMessagesByTurnId({
      db,
      sessionId,
      turnId,
    }),
  listPhaseResponsesBySession: (sessionId: string) =>
    trainingCurriculumRepository.listPhaseResponsesBySession({
      db,
      sessionId,
    }),
  getPhaseResponses: (unitContentId: string, sessionId: string) =>
    trainingCurriculumRepository.getPhaseResponses({
      db,
      unitContentId,
      sessionId,
    }),
  getUnitRun: (sessionId: string, unitContentId: string) =>
    trainingUnitRunRepository.getUnitRun({
      db,
      sessionId,
      unitContentId,
    }),
  upsertUnitRun: (run) =>
    trainingUnitRunRepository.upsertUnitRun({
      db,
      run,
    }),
  getUnitByNodeId: (nodeId: string) =>
    trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
  createUnitContent: (payload: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
    unitMasteryContract?: UnitContent["unitMasteryContract"];
  }) =>
    trainingCurriculumRepository.createUnitContent({
      db,
      ...payload,
    }),
  savePhaseResponse: (payload) =>
    trainingCurriculumRepository.savePhaseResponse({
      db,
      ...payload,
    }),
  updateUnitMasteryContract: (payload) =>
    trainingCurriculumRepository.updateUnitMasteryContract({
      db,
      ...payload,
    }),
  updateOpenScenarioContract: (payload: {
    userId: string;
    nodeId: string;
    scenarioPrompt: string;
    scenarioContract: NonNullable<
      WorkspaceAiEducationOutput["scenarioEvaluationContract"]
    >;
  }) =>
    trainingRatingRepository.updateOpenScenarioContract({
      db,
      ...payload,
    }),
  saveAttempt: (payload) =>
    trainingAttemptRepository.saveAttempt({
      db,
      ...payload,
    }),
  completeNode: async (nodeId: string) => {
    const node = await trainingCurriculumRepository.completeNode({ db, nodeId });
    return node
      ? ({
          id: node.id,
          parentNodeId: node.parentNodeId,
          kind: node.kind as CurriculumNode["kind"],
          title: node.title,
          summary: node.summary,
          whyItMatters: node.whyItMatters,
          learningGoal: node.summary,
          orderIndex: node.orderIndex,
          depth: node.depth,
          positionColumn: node.positionColumn,
          positionRow: node.positionRow,
          status: node.status as CurriculumNode["status"],
          difficultyBands: node.difficultyBands ?? null,
        } satisfies CurriculumNode)
      : null;
  },
  prewarmWorkspaceUnit: (node: CurriculumNode) =>
    ensureWorkspaceUnit({ node, deps: createWorkspaceTurnRepositoryDeps(db) }),
  touchSession: (sessionId: string) =>
    trainingOnboardingRepository.touchSession({ db, sessionId }),
  listMemories: async (userId: string) => {
    const result = await memoryRepository.listByUserId({
      db,
      userId,
    });

    return result.success ? result.data : [];
  },
  prepareDifficultyDirective: ({
    userId,
    nodeId,
    now,
    bands,
  }: {
    userId: string;
    nodeId: string;
    now: Date;
    bands?: readonly DifficultyBand[] | null;
  }) =>
    prepareScenarioDirective({
      userId,
      nodeId,
      now,
      bands,
      deps: createTrainingRatingGoldilocksDeps(db),
    }),
  applyManualDifficultyNudge: ({
    userId,
    nodeId,
    signal,
    now,
  }: {
    userId: string;
    nodeId: string;
    signal: ManualDifficultySignal;
    now: Date;
  }) =>
    trainingRatingRepository.applyManualDifficultyNudge({
      db,
      userId,
      nodeId,
      signal,
      initialRatingState: createInitialRatingState(),
      now,
    }),
  getOpenScenario: ({ userId, nodeId }) =>
    trainingRatingRepository.getOpenScenario({
      db,
      userId,
      nodeId,
    }),
  updateOpenScenarioItemRating: ({ userId, nodeId, itemRating }) =>
    trainingRatingRepository.updateOpenScenarioItemRating({
      db,
      userId,
      nodeId,
      itemRating,
    }),
  recordEvaluation: ({
    userId,
    nodeId,
    score,
    errorCodes,
    wasOverTime,
    occurredAt,
    bands,
  }) =>
    recordEvaluation({
      userId,
      nodeId,
      score,
      errorCodes,
      sidechatAskCount: 0,
      wasOverTime,
      occurredAt,
      bands,
      deps: createTrainingRatingGoldilocksDeps(db),
    }),
});
