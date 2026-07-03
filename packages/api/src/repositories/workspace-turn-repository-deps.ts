import type { db as databaseClient } from "@acme/db/client";
import { and, eq } from "@acme/db";
import { TrainingUnitRun, TrainingWorkspaceTurn } from "@acme/db/schema";

import type {
  CurriculumNode,
  DifficultyBand,
} from "../domain/training/types/training.types";
import type {
  WorkspaceAiEducationOutput,
  WorkspaceAiMessage,
} from "../domain/training/workspace-ai/types";
import type {
  ManualDifficultySignal,
  WorkspaceTurnOrchestrationDependencies,
} from "../domain/training/workspace-ai/workspace-turn-orchestration";
import type {
  WorkspaceEducationTurnCommit,
  WorkspaceNextScenarioCommit,
  WorkspaceRecallTurnCommit,
} from "../domain/training/workspace-ai/workspace-turn-persistence";
import { createInitialRatingState } from "../domain/training/engine/rating";
import {
  prepareScenarioDirective,
  recordEvaluation,
  resolveScenarioDirective,
} from "../domain/training/orchestration/goldilocks";
import { memoryRepository } from "./memory-repository";
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
  turnId?: string | null;
  leaseId?: string | null;
}) => {
  if (!turnId) return;
  if (!leaseId) {
    throw new Error("Workspace turn lease is missing.");
  }

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

const toCurriculumNode = (
  node: Awaited<ReturnType<typeof trainingCurriculumRepository.completeNode>>,
): CurriculumNode | null =>
  node
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
  turnId?: string | null;
  leaseId?: string | null;
  assistantMessage: WorkspaceAiMessage;
  userMessage?: WorkspaceAiMessage | null;
}) => {
  if (!turnId || !assistantMessage.id) return;
  if (!leaseId) {
    throw new Error("Workspace turn lease is missing.");
  }

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

const commitNextScenarioPrompt = async ({
  db,
  input,
}: {
  db: Database;
  input: WorkspaceNextScenarioCommit;
}): Promise<{ assistantMessage: WorkspaceAiMessage }> =>
  db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    await assertWorkspaceTurnLease({
      db: txDb,
      sessionId: input.assistantMessage.sessionId,
      turnId: input.turnId,
      leaseId: input.turnLeaseId,
    });
    await applyContracts({ db: txDb, contracts: input.contracts });

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
      sequence: input.phaseResponse.sequence ?? assistantMessage.sequence,
    });
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
    });

    return { assistantMessage };
  });

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
          originTurnId: input.turnId ?? null,
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
      await trainingRatingRepository.stampSolvePresentation({
        db: txDb,
        scenarioAttemptId: input.solvePresentation.scenarioAttemptId,
        solvePromptTurnId: input.turnId ?? null,
        presentedAt: input.solvePresentation.presentedAt,
      });
    }
    if (input.ratingEvaluation) {
      await recordEvaluation({
        ...input.ratingEvaluation,
        sidechatAskCount: 0,
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

const commitRecallTurn = async ({
  db,
  input,
}: {
  db: Database;
  input: WorkspaceRecallTurnCommit;
}): Promise<{ assistantMessage: WorkspaceAiMessage }> =>
  db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    await assertWorkspaceTurnLease({
      db: txDb,
      sessionId: input.assistantMessage.sessionId,
      turnId: input.turnId,
      leaseId: input.turnLeaseId,
    });

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
      sequence: input.phaseResponse.sequence ?? assistantMessage.sequence,
    });
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
  getUnitByNodeId: (nodeId: string) =>
    trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
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
  updateScenarioContract: (payload: {
    scenarioAttemptId: string;
    scenarioPrompt: string;
    scenarioContract: NonNullable<
      WorkspaceAiEducationOutput["scenarioEvaluationContract"]
    >;
  }) =>
    trainingRatingRepository.updateScenarioContract({
      db,
      ...payload,
    }),
  saveAttempt: (payload) =>
    trainingAttemptRepository.saveAttempt({
      db,
      ...payload,
    }),
  completeNode: async (nodeId: string) => {
    const node = await trainingCurriculumRepository.completeNode({
      db,
      nodeId,
    });
    return toCurriculumNode(node);
  },
  commitEducationTurn: (input) => commitEducationTurn({ db, input }),
  commitRecallTurn: (input) => commitRecallTurn({ db, input }),
  commitNextScenarioPrompt: (input) => commitNextScenarioPrompt({ db, input }),
  markWorkspaceTurnFailed: (input) => markWorkspaceTurnFailed({ db, ...input }),
  touchSession: (sessionId: string) =>
    trainingOnboardingRepository.touchSession({ db, sessionId }),
  listMemories: async (userId: string) => {
    const result = await memoryRepository.listByUserId({
      db,
      userId,
    });

    return result.success ? result.data : [];
  },
  getUnitSyllabusContext: (unitNodeId: string) =>
    trainingSyllabusRepository.getUnitContext({ db, unitNodeId }),
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
    resolveScenarioDirective({
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
  getScenarioAttempt: ({ scenarioAttemptId, userId, nodeId }) =>
    trainingRatingRepository.getOpenScenarioById({
      db,
      scenarioAttemptId,
      userId,
      nodeId,
    }),
});
