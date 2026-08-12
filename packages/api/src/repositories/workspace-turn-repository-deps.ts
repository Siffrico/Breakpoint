import { Effect, Layer } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, eq, isNull, lt, or } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingEducationExperiencePreference,
  TrainingUnitRun,
  TrainingWorkspaceTurn,
} from "@acme/db/schema";
import { EducationExperienceCustomizationSchema } from "@acme/validators";

import type { PersistedUnitRun } from "../domain/training/education-unit/unit-state";
import type { JobRatingState } from "../domain/training/engine/rating";
import type { RecallCandidate } from "../domain/training/policies/recall-decay";
import type { DifficultyBand } from "../domain/training/types/training.types";
import type { WorkspaceAiMessage } from "../domain/training/workspace-ai/types";
import type { WorkspaceTurnOrchestrationDependencies } from "../domain/training/workspace-ai/workspace-turn-orchestration";
import type { WorkspaceEducationTurnCommit } from "../domain/training/workspace-ai/workspace-turn-persistence";
import { resolveEducationExperienceCustomization } from "../domain/training/education-unit/experience";
import { resolveScenarioFormat } from "../domain/training/engine/progression-model";
import {
  auditDialCompliance,
  predictItemRating,
} from "../domain/training/engine/rating";
import {
  recordEvaluation,
  resolveScenarioDirective,
} from "../domain/training/orchestration/goldilocks";
import { workspaceLeaseExpiry } from "../domain/training/workspace-ai/workspace-lease";
import { WorkspaceTurnRepo } from "../domain/training/workspace-ai/workspace-turn-repo";
import { makeDbError } from "../effect/db";
import { memoryRepository } from "./memory-repository";
import { resolvePlanSeedRating } from "./plan-seed-rating";
import { skillKnowledgeRepository } from "./skill-knowledge-repository";
import { trainingAttemptRepository } from "./training-attempt-repository";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingOnboardingRepository } from "./training-onboarding-repository";
import { createTrainingRatingGoldilocksDeps } from "./training-rating-goldilocks-deps";
import { trainingRatingRepository } from "./training-rating-repository";
import { trainingUnitRunRepository } from "./training-unit-run-repository";

type Database = typeof databaseClient;

const claimWorkspaceUnitLease = async ({
  db,
  sessionId,
  unitContentId,
  leaseId,
  run,
}: {
  db: Database;
  sessionId: string;
  unitContentId: string;
  leaseId: string;
  run: PersistedUnitRun;
}) => {
  const now = new Date();
  const [leasedRun] = await db
    .insert(TrainingUnitRun)
    .values({
      sessionId,
      unitContentId,
      userId: run.userId,
      kind: run.kind,
      experienceId: run.experience.id,
      experienceVersion: run.experience.version,
      experienceJson: run.experience,
      unitContextJson: run.unitContext,
      cursorJson: run.cursor,
      difficultySnapshotJson: run.difficultySnapshot,
      turnLeaseId: leaseId,
      turnLeaseExpiresAt: workspaceLeaseExpiry(now),
    })
    .onConflictDoUpdate({
      target: [
        TrainingUnitRun.sessionId,
        TrainingUnitRun.unitContentId,
        TrainingUnitRun.kind,
      ],
      set: {
        turnLeaseId: leaseId,
        turnLeaseExpiresAt: workspaceLeaseExpiry(now),
      },
      setWhere: or(
        isNull(TrainingUnitRun.turnLeaseId),
        isNull(TrainingUnitRun.turnLeaseExpiresAt),
        lt(TrainingUnitRun.turnLeaseExpiresAt, now),
      ),
    })
    .returning({ id: TrainingUnitRun.id });

  return Boolean(leasedRun);
};

/**
 * Pushes both of a turn's leases forward, and reports whether this lease still
 * owns them. A `false` means another request took over after an expiry — the
 * heartbeat stops, and the commit's lease assertions reject the turn.
 */
const renewWorkspaceLeases = async ({
  db,
  sessionId,
  unitContentId,
  turnId,
  leaseId,
}: {
  db: Database;
  sessionId: string;
  unitContentId: string;
  turnId: string;
  leaseId: string;
}) => {
  const leaseExpiresAt = workspaceLeaseExpiry();
  const [renewedTurn, renewedRun] = await Promise.all([
    db
      .update(TrainingWorkspaceTurn)
      .set({ leaseExpiresAt })
      .where(
        and(
          eq(TrainingWorkspaceTurn.sessionId, sessionId),
          eq(TrainingWorkspaceTurn.turnId, turnId),
          eq(TrainingWorkspaceTurn.status, "processing"),
          eq(TrainingWorkspaceTurn.leaseId, leaseId),
        ),
      )
      .returning({ id: TrainingWorkspaceTurn.id }),
    db
      .update(TrainingUnitRun)
      .set({ turnLeaseExpiresAt: leaseExpiresAt })
      .where(
        and(
          eq(TrainingUnitRun.sessionId, sessionId),
          eq(TrainingUnitRun.unitContentId, unitContentId),
          eq(TrainingUnitRun.turnLeaseId, leaseId),
        ),
      )
      .returning({ id: TrainingUnitRun.id }),
  ]);

  return renewedTurn.length > 0 && renewedRun.length > 0;
};

const releaseWorkspaceUnitLease = async ({
  db,
  sessionId,
  unitContentId,
  leaseId,
}: {
  db: Database;
  sessionId: string;
  unitContentId: string;
  leaseId: string;
}) => {
  await db
    .update(TrainingUnitRun)
    .set({ turnLeaseId: null, turnLeaseExpiresAt: null })
    .where(
      and(
        eq(TrainingUnitRun.sessionId, sessionId),
        eq(TrainingUnitRun.unitContentId, unitContentId),
        eq(TrainingUnitRun.turnLeaseId, leaseId),
      ),
    );
};

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
    .set({ leaseExpiresAt: workspaceLeaseExpiry() })
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

const assertWorkspaceUnitLease = async ({
  db,
  sessionId,
  unitContentId,
  leaseId,
}: {
  db: Database;
  sessionId: string;
  unitContentId: string;
  leaseId: string;
}) => {
  const [leasedRun] = await db
    .update(TrainingUnitRun)
    .set({ turnLeaseExpiresAt: workspaceLeaseExpiry() })
    .where(
      and(
        eq(TrainingUnitRun.sessionId, sessionId),
        eq(TrainingUnitRun.unitContentId, unitContentId),
        eq(TrainingUnitRun.turnLeaseId, leaseId),
      ),
    )
    .returning({ id: TrainingUnitRun.id });

  if (!leasedRun) {
    throw new Error("Workspace unit lease is no longer valid.");
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
    await assertWorkspaceUnitLease({
      db: txDb,
      sessionId: input.nextRun.sessionId,
      unitContentId: input.nextRun.unitId,
      leaseId: input.unitLeaseId,
    });
    let presentedScenarioAttemptId: string | null = null;
    if (input.scenarioPresentation) {
      const unitRun = await txDb.query.TrainingUnitRun.findFirst({
        where: and(
          eq(TrainingUnitRun.sessionId, input.nextRun.sessionId),
          eq(TrainingUnitRun.unitContentId, input.nextRun.unitId),
          eq(TrainingUnitRun.kind, input.nextRun.kind),
        ),
      });
      if (!unitRun) {
        throw new Error(
          "Pass-2 scenario presentation requires a durable unit run.",
        );
      }
      const presentation = input.scenarioPresentation;
      const activeChallenge = input.nextRun.activeReviewChallenge;
      if (!activeChallenge) {
        throw new Error("A rating attempt requires its review challenge.");
      }
      const vector = activeChallenge.difficultyVector;
      let itemRating = presentation.snapshot.directive.targetItemRating;
      if (presentation.snapshot.format) {
        try {
          itemRating = predictItemRating(vector, [
            presentation.snapshot.format,
          ]);
          if (presentation.snapshot.dialPreset) {
            const audit = auditDialCompliance(
              vector,
              presentation.snapshot.dialPreset,
            );
            if (Object.values(audit).some((axis) => !axis.inRange)) {
              console.warn(
                "Scenario difficulty vector missed its dial preset",
                {
                  nodeId: presentation.nodeId,
                  vector,
                  audit,
                },
              );
            }
          }
        } catch (error) {
          console.warn(
            "Scenario difficulty vector could not be rated; using directive target",
            {
              nodeId: presentation.nodeId,
              vector,
              error,
            },
          );
        }
      }
      const attempt =
        await trainingRatingRepository.openEducationScenarioAttempt({
          db: txDb,
          unitRunId: unitRun.id,
          originTurnId: input.turnId,
          userId: presentation.userId,
          nodeId: presentation.nodeId,
          directive: presentation.snapshot.directive,
          itemRating,
          difficultyVector: vector,
          scenarioPrompt: input.assistantMessage.content,
          scenarioContract: activeChallenge.contract,
          presentedAt: presentation.presentedAt,
        });
      presentedScenarioAttemptId = attempt.id;
    }
    if (input.solvePresentation) {
      // The review presentation opens its rating attempt in this same commit
      // and stamps the learner's answer clock directly.
      const solveAttemptId =
        input.solvePresentation.scenarioAttemptId ?? presentedScenarioAttemptId;
      if (!solveAttemptId) {
        throw new Error(
          "Review presentation has no scenario attempt to stamp.",
        );
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

    if (input.phaseResponse) {
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
    }
    await trainingUnitRunRepository.upsertUnitRun({
      db: txDb,
      run: input.nextRun,
    });

    if (input.knowledgeCheckOff) {
      await skillKnowledgeRepository.checkOffKnowledge({
        db: txDb,
        ...input.knowledgeCheckOff,
      });
    }

    if (input.knowledgeReinforcement) {
      await skillKnowledgeRepository.applyReinforcement({
        db: txDb,
        knowledgeIds: input.knowledgeReinforcement.knowledgeIds,
        passed: input.knowledgeReinforcement.passed,
        occurredAt: new Date(),
      });
    }

    if (input.skillPractice) {
      await skillKnowledgeRepository.incrementSkillPractice({
        db: txDb,
        knowledgeIds: input.skillPractice.knowledgeIds,
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
    await releaseWorkspaceUnitLease({
      db: txDb,
      sessionId: input.nextRun.sessionId,
      unitContentId: input.nextRun.unitId,
      leaseId: input.unitLeaseId,
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
            mode: input.nextRun.mode,
            attempt: 1,
          },
        }),
      ),
  });

export const createWorkspaceTurnRepositoryDeps = (
  db: Database,
  userId?: string,
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
  let experiencePromise: ReturnType<
    NonNullable<
      WorkspaceTurnOrchestrationDependencies["getEducationExperience"]
    >
  > | null = null;
  const getEducationExperience = () => {
    if (!userId) {
      return Promise.resolve(resolveEducationExperienceCustomization(null));
    }
    experiencePromise ??=
      db.query.TrainingEducationExperiencePreference.findFirst({
        where: eq(TrainingEducationExperiencePreference.userId, userId),
      }).then((preference) =>
        resolveEducationExperienceCustomization(
          preference
            ? {
                version: preference.version,
                customization: EducationExperienceCustomizationSchema.parse(
                  preference.customizationJson,
                ),
              }
            : null,
        ),
      );
    return experiencePromise;
  };

  return {
    getEducationExperience,
    getActivePlan: (sessionId: string) =>
      trainingCurriculumRepository.getActivePlan({ db, sessionId }),
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
    claimWorkspaceUnitLease: (input) =>
      claimWorkspaceUnitLease({ db, ...input }),
    renewWorkspaceLeases: (input) => renewWorkspaceLeases({ db, ...input }),
    releaseWorkspaceUnitLease: (input) =>
      releaseWorkspaceUnitLease({ db, ...input }),
    appendMessage: (payload) =>
      trainingOnboardingRepository.appendWorkspaceMessage({
        db,
        ...payload,
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
    savePendingChallenge: (input) =>
      trainingUnitRunRepository.setPendingChallenge({ db, ...input }),
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
    getRecallCandidatesByIds: (
      planId: string,
      knowledgeIds: readonly string[],
    ) =>
      skillKnowledgeRepository.getRecallCandidatesByIds({
        db,
        planId,
        knowledgeIds,
      }),
    getMostOverdueRecallCandidate: (planId: string, now: Date) =>
      skillKnowledgeRepository.getMostOverdueRecallCandidate({
        db,
        planId,
        now,
      }),
    getRecallCompanionCandidate: (
      skillNodeId: string,
      primary: Pick<
        RecallCandidate,
        "id" | "questionId" | "questionOrderIndex" | "orderIndex"
      >,
      now: Date,
    ) =>
      skillKnowledgeRepository.getRecallCompanionCandidate({
        db,
        skillNodeId,
        primary,
        now,
      }),
    markWorkspaceTurnFailed: (input) =>
      markWorkspaceTurnFailed({ db, ...input }),
    listMemories: async (userId: string) => {
      const result = await memoryRepository.listByUserId({
        db,
        userId,
      });

      return result.success ? result.data : [];
    },
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
      Promise.all([
        getSeed(nodeId),
        db.query.TrainingCurriculumNode.findFirst({
          where: eq(TrainingCurriculumNode.id, nodeId),
        }),
      ]).then(([seed, ratingNode]) => {
        if (!ratingNode?.practiceContract) {
          throw new Error("Outcome is missing its Practice Contract.");
        }
        return resolveScenarioDirective({
          userId,
          nodeId,
          now,
          bands,
          initialRatingState: seed ?? undefined,
          scenarioFormat: resolveScenarioFormat(ratingNode.practiceContract),
          deps: createTrainingRatingGoldilocksDeps(db),
        });
      }),
    getScenarioAttempt: ({ scenarioAttemptId, userId, nodeId }) =>
      trainingRatingRepository.getOpenScenarioById({
        db,
        scenarioAttemptId,
        userId,
        nodeId,
      }),
  };
};
