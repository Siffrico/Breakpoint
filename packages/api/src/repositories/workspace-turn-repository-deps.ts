import { Effect, Layer } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, eq } from "@acme/db";
import { TrainingUnitRun, TrainingWorkspaceTurn } from "@acme/db/schema";

import type { JobRatingState } from "../domain/training/engine/rating";
import type { DifficultyBand } from "../domain/training/types/training.types";
import type { WorkspaceAiMessage } from "../domain/training/workspace-ai/types";
import type { WorkspaceTurnOrchestrationDependencies } from "../domain/training/workspace-ai/workspace-turn-orchestration";
import type { WorkspaceEducationTurnCommit } from "../domain/training/workspace-ai/workspace-turn-persistence";
import {
  recordEvaluation,
  resolveScenarioDirective,
} from "../domain/training/orchestration/goldilocks";
import { WorkspaceTurnRepo } from "../domain/training/workspace-ai/workspace-turn-repo";
import { makeDbError } from "../effect/db";
import { memoryRepository } from "./memory-repository";
import { resolvePlanSeedRating } from "./plan-seed-rating";
import { trainingAttemptRepository } from "./training-attempt-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import { createTrainingRatingGoldilocksDeps } from "./training-rating-goldilocks-deps";
import { trainingRatingRepository } from "./training-rating-repository";
import { trainingSyllabusRepository } from "./training-syllabus-repository";
import { trainingUnitRunRepository } from "./training-unit-run-repository";

type Database = typeof databaseClient;
const WORKSPACE_TURN_LEASE_MS = 15 * 60 * 1_000;

const assertWorkspaceTurnLease = async ({
  db,
  sessionId,
  turnId,
  leaseId,
}: {
  db: Database;
  sessionId: string;
  turnId: string;
  leaseId: string;
}) => {
  const [leasedTurn] = await db
    .update(TrainingWorkspaceTurn)
    .set({
      leaseExpiresAt: new Date(Date.now() + WORKSPACE_TURN_LEASE_MS),
    })
    .where(
      and(
        eq(TrainingWorkspaceTurn.sessionId, sessionId),
        eq(TrainingWorkspaceTurn.turnId, turnId),
        eq(TrainingWorkspaceTurn.status, "processing"),
        eq(TrainingWorkspaceTurn.leaseId, leaseId),
      ),
    )
    .returning({ id: TrainingWorkspaceTurn.id });

  if (!leasedTurn) {
    throw new Error("Workspace turn lease is no longer valid.");
  }
};

const markWorkspaceTurnCompleted = async ({
  db,
  sessionId,
  turnId,
  leaseId,
  assistantMessage,
  userMessage,
}: {
  db: Database;
  sessionId: string;
  turnId: string;
  leaseId: string;
  assistantMessage: WorkspaceAiMessage;
  userMessage?: WorkspaceAiMessage | null;
}) => {
  if (!assistantMessage.id) return;

  await db
    .update(TrainingWorkspaceTurn)
    .set({
      status: "completed",
      assistantMessageId: assistantMessage.id,
      userMessageId: userMessage?.id ?? null,
      leaseId: null,
      leaseExpiresAt: null,
      failureReason: null,
    })
    .where(
      and(
        eq(TrainingWorkspaceTurn.sessionId, sessionId),
        eq(TrainingWorkspaceTurn.turnId, turnId),
        eq(TrainingWorkspaceTurn.leaseId, leaseId),
      ),
    );
};

const markWorkspaceTurnFailed = async ({
  db,
  sessionId,
  turnId,
  leaseId,
  reason,
}: {
  db: Database;
  sessionId: string;
  turnId: string;
  leaseId: string;
  reason: string;
}) => {
  await db
    .update(TrainingWorkspaceTurn)
    .set({
      status: "failed",
      leaseId: null,
      leaseExpiresAt: null,
      failureReason: reason.slice(0, 2_000),
    })
    .where(
      and(
        eq(TrainingWorkspaceTurn.sessionId, sessionId),
        eq(TrainingWorkspaceTurn.turnId, turnId),
        eq(TrainingWorkspaceTurn.status, "processing"),
        eq(TrainingWorkspaceTurn.leaseId, leaseId),
      ),
    );
};

const applyContracts = async ({
  db,
  contracts,
}: {
  db: Database;
  contracts: WorkspaceEducationTurnCommit["contracts"];
}) => {
  if (!contracts) return;

  if (contracts.unitMasteryContract) {
    await trainingCurriculumRepository.updateUnitMasteryContract({
      db,
      unitContentId: contracts.unitContentId,
      unitMasteryContract: contracts.unitMasteryContract,
    });
  }

  if (contracts.openScenarioContract) {
    const updated = await trainingRatingRepository.updateScenarioContract({
      db,
      ...contracts.openScenarioContract,
    });
    if (!updated) {
      throw new Error(
        "Scenario evaluation contract could not be attached to an open scenario.",
      );
    }
  }
};

const commitEducationTurn = async ({
  db,
  input,
}: {
  db: Database;
  input: WorkspaceEducationTurnCommit;
}): Promise<{
  assistantMessage: WorkspaceAiMessage;
}> =>
  db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    await assertWorkspaceTurnLease({
      db: txDb,
      sessionId: input.assistantMessage.sessionId,
      turnId: input.turnId,
      leaseId: input.turnLeaseId,
    });
    await applyContracts({ db: txDb, contracts: input.contracts });

    let presentedScenarioAttemptId: string | null = null;
    if (input.scenarioPresentation) {
      const unitRun = await txDb.query.TrainingUnitRun.findFirst({
        where: and(
          eq(TrainingUnitRun.sessionId, input.nextRun.sessionId),
          eq(TrainingUnitRun.unitContentId, input.nextRun.unitId),
        ),
      });
      if (!unitRun) {
        throw new Error(
          "Pass-2 scenario presentation requires a durable unit run.",
        );
      }
      const presentation = input.scenarioPresentation;
      const attempt =
        await trainingRatingRepository.openEducationScenarioAttempt({
          db: txDb,
          unitRunId: unitRun.id,
          originTurnId: input.turnId,
          userId: presentation.userId,
          nodeId: presentation.nodeId,
          directive: presentation.snapshot.directive,
          itemRating: presentation.snapshot.directive.targetItemRating,
          scenarioPrompt: input.assistantMessage.content,
          presentedAt: presentation.presentedAt,
        });
      presentedScenarioAttemptId = attempt.id;
    }
    if (input.solvePresentation) {
      // A recall presentation opens its attempt in this same commit and
      // stamps it directly; education stamps the attempt opened at Connect.
      const solveAttemptId =
        input.solvePresentation.scenarioAttemptId ?? presentedScenarioAttemptId;
      if (!solveAttemptId) {
        throw new Error("Solve presentation has no scenario attempt to stamp.");
      }
      await trainingRatingRepository.stampSolvePresentation({
        db: txDb,
        scenarioAttemptId: solveAttemptId,
        solvePromptTurnId: input.turnId,
        presentedAt: input.solvePresentation.presentedAt,
      });
    }
    if (input.ratingEvaluation) {
      // Fail-closed seed read: a null seed means the engine uses its default.
      const seed = await resolvePlanSeedRating({
        db: txDb,
        nodeId: input.ratingEvaluation.nodeId,
      });
      await recordEvaluation({
        ...input.ratingEvaluation,
        sidechatAskCount: 0,
        initialRatingState: seed ?? undefined,
        deps: createTrainingRatingGoldilocksDeps(txDb),
      });
    }

    const userMessage = input.userMessage
      ? await trainingOnboardingRepository.appendWorkspaceMessage({
          db: txDb,
          ...input.userMessage,
        })
      : null;
    const assistantMessage =
      await trainingOnboardingRepository.appendWorkspaceMessage({
        db: txDb,
        ...input.assistantMessage,
      });
    if (!assistantMessage) {
      throw new Error("AI response could not be saved.");
    }

    await trainingCurriculumRepository.savePhaseResponse({
      db: txDb,
      ...input.phaseResponse,
      metadata: presentedScenarioAttemptId
        ? {
            ...input.phaseResponse.metadata,
            scenarioAttemptId: presentedScenarioAttemptId,
          }
        : input.phaseResponse.metadata,
      sequence: input.phaseResponse.sequence ?? assistantMessage.sequence,
    });
    await trainingUnitRunRepository.upsertUnitRun({
      db: txDb,
      run: input.nextRun,
    });

    if (input.syllabusCheckOff) {
      await trainingSyllabusRepository.checkOffEntries({
        db: txDb,
        ...input.syllabusCheckOff,
      });
    }

    if (input.syllabusReinforcement) {
      await trainingSyllabusRepository.applyReinforcement({
        db: txDb,
        entryIds: input.syllabusReinforcement.entryIds,
        passed: input.syllabusReinforcement.passed,
        occurredAt: new Date(),
      });
    }

    if (input.completion) {
      await trainingAttemptRepository.saveAttempt({
        db: txDb,
        ...input.completion.attempt,
      });
    }

    await trainingOnboardingRepository.touchSession({
      db: txDb,
      sessionId: input.touchSessionId,
    });
    await markWorkspaceTurnCompleted({
      db: txDb,
      sessionId: input.assistantMessage.sessionId,
      turnId: input.turnId,
      leaseId: input.turnLeaseId,
      assistantMessage,
      userMessage,
    });

    return { assistantMessage };
  });

export const workspaceTurnRepoLayer = (db: Database) =>
  Layer.succeed(WorkspaceTurnRepo, {
    commitEducationTurn: (input) =>
      Effect.tryPromise({
        try: () => commitEducationTurn({ db, input }),
        catch: (cause) => makeDbError("commitEducationTurn", cause),
      }).pipe(
        Effect.tap(() => Effect.annotateCurrentSpan({ outcome: "success" })),
        Effect.tapError((error) =>
          Effect.annotateCurrentSpan({ outcome: error.kind }),
        ),
        Effect.withSpan("workspace-turn.commit", {
          attributes: {
            purpose: "education",
            phase: input.nextRun.phase,
            attempt: 1,
          },
        }),
      ),
  });

export const createWorkspaceTurnRepositoryDeps = (
  db: Database,
): WorkspaceTurnOrchestrationDependencies => {
  // Per-request seed cache: a multi-touch turn reads each node's seed once.
  const seedCache = new Map<string, Promise<JobRatingState | null>>();
  const getSeed = (nodeId: string) => {
    const cached = seedCache.get(nodeId);
    if (cached) return cached;
    const pending = resolvePlanSeedRating({ db, nodeId });
    seedCache.set(nodeId, pending);
    return pending;
  };

  return {
    getActivePlan: (sessionId: string) =>
      trainingCurriculumRepository.getActivePlan({ db, sessionId }),
    listMessages: (sessionId: string, slot?: "education_unit" | "recall") =>
      trainingOnboardingRepository.listWorkspaceMessages({
        db,
        sessionId,
        slot,
      }),
    listUnitMessages: (sessionId: string, unitId: string) =>
      trainingOnboardingRepository.listWorkspaceMessagesByUnit({
        db,
        sessionId,
        unitId,
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
    getInFlightRecallRun: (sessionId: string) =>
      trainingUnitRunRepository.getInFlightRecallRun({ db, sessionId }),
    retireInFlightRecallRun: (sessionId: string, unitContentId: string) =>
      trainingUnitRunRepository.retireInFlightRecallRun({
        db,
        sessionId,
        unitContentId,
      }),
    getUnitByNodeId: (nodeId: string) =>
      trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
    listRecallCandidates: (planId: string) =>
      trainingSyllabusRepository.listRecallCandidates({ db, planId }),
    markWorkspaceTurnFailed: (input) =>
      markWorkspaceTurnFailed({ db, ...input }),
    listMemories: async (userId: string) => {
      const result = await memoryRepository.listByUserId({
        db,
        userId,
      });

      return result.success ? result.data : [];
    },
    getUnitSyllabusContext: (unitNodeId: string) =>
      trainingSyllabusRepository.getUnitContext({ db, unitNodeId }),
    resolveDifficultyDirective: ({
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
      getSeed(nodeId).then((seed) =>
        resolveScenarioDirective({
          userId,
          nodeId,
          now,
          bands,
          initialRatingState: seed ?? undefined,
          deps: createTrainingRatingGoldilocksDeps(db),
        }),
      ),
    getScenarioAttempt: ({ scenarioAttemptId, userId, nodeId }) =>
      trainingRatingRepository.getOpenScenarioById({
        db,
        scenarioAttemptId,
        userId,
        nodeId,
      }),
  };
};
