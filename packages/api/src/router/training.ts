import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { CurriculumNode } from "@acme/validators";
import { sql } from "@acme/db";
import { CapstoneSubmissionSchema } from "@acme/validators";

import { deriveProvisionalProjectTitle } from "../domain/training/services/provisional-project-title";
import { mintNextUnit } from "../domain/training/unit-minting/mint-next-unit";
import { UnitNotReadyError } from "../domain/training/unit-preparation/errors";
import { raiseUnitPreparationError } from "../domain/training/unit-preparation/prepare-unit-edge";
import { advanceCompletedUnitWorkflow } from "../domain/training/workflows/advance-completed-unit-workflow";
import { continueLearningProjectWorkflow } from "../domain/training/workflows/continue-learning-project-workflow";
import { createLearningProjectWorkflow } from "../domain/training/workflows/create-learning-project-workflow";
import { generateCapstoneWorkflow } from "../domain/training/workflows/generate-capstone-workflow";
import { getActivePlanWorkflow } from "../domain/training/workflows/get-active-plan-workflow";
import { getAiWorkspaceWorkflow } from "../domain/training/workflows/get-ai-workspace-workflow";
import { getCapstoneWorkflow } from "../domain/training/workflows/get-capstone-workflow";
import { getHomeStateWorkflow } from "../domain/training/workflows/get-home-state-workflow";
import { getProfileWorkflow } from "../domain/training/workflows/get-profile-workflow";
import { getUnitWorkflow } from "../domain/training/workflows/get-unit-workflow";
import { getWorkspaceIndexWorkflow } from "../domain/training/workflows/get-workspace-index-workflow";
import { prepareUnitWorkflow } from "../domain/training/workflows/prepare-unit-workflow";
import { startOnboardingWorkflow } from "../domain/training/workflows/start-onboarding-workflow";
import { submitAiWorkspaceMessageWorkflow } from "../domain/training/workflows/submit-ai-workspace-message-workflow";
import { submitCapstoneMessageWorkflow } from "../domain/training/workflows/submit-capstone-message-workflow";
import { queryWithClient } from "../effect/db";
import { recoverSkillUnits } from "../repositories/build-project-repository-deps";
import { trainingAttemptRepository } from "../repositories/training-attempt-repository";
import { trainingCapstoneRepository } from "../repositories/training-capstone-repository";
import { trainingCurriculumRepository } from "../repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "../repositories/training-onboarding-repository";
import { trainingRatingRepository } from "../repositories/training-rating-repository";
import { trainingRecallRepository } from "../repositories/training-recall-repository";
import { trainingUnitRunRepository } from "../repositories/training-unit-run-repository";
import {
  createUnitMintingRepositoryDeps,
  loadSkillMasteryState,
  openSkillSimulation,
} from "../repositories/unit-minting-repository-deps";
import { createUnitPreparationRepositoryDeps } from "../repositories/unit-preparation-repository-deps";
import { createWorkspaceTurnRepositoryDeps } from "../repositories/workspace-turn-repository-deps";
import { protectedProcedure } from "../trpc";

const SessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const SubmitAiWorkspaceMessageSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(8_000),
  turnId: z.string().min(1).max(96).optional(),
  attemptTiming: z
    .object({
      elapsedSeconds: z.number().int(),
      timeLimitSeconds: z.number().int().positive(),
      overrunSeconds: z.number().int().min(0),
      wasOverTime: z.boolean(),
      pausedSeconds: z.number().int().min(0).optional(),
    })
    .optional(),
});

const NodeSessionSchema = z.object({
  nodeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

const SubmitCapstoneMessageSchema = CapstoneSubmissionSchema.extend({
  sessionId: z.string().uuid(),
});

const CreateLearningProjectSchema = z.object({
  title: z.string().min(2).max(120),
  targetIdentity: z.string().max(240).optional(),
  curriculumMarkdown: z.string().max(120_000).optional(),
});

type Database = Parameters<
  typeof trainingCurriculumRepository.getNodeById
>[0]["db"];

const lockCapstoneNode = async ({
  db,
  sessionId,
  nodeId,
}: {
  db: Database;
  sessionId: string;
  nodeId: string;
}) => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${sessionId}), hashtext(${nodeId}))`,
  );
};

const createCapstoneGenerationDeps = (
  db: Database,
): Parameters<typeof generateCapstoneWorkflow>[0]["deps"] => ({
  getNodeById: (nodeId: string) =>
    trainingCurriculumRepository.getNodeById({
      db,
      nodeId,
    }),
  getPlanNodesBySession: (sessionId: string) =>
    trainingCurriculumRepository.getPlanNodesBySession({
      db,
      sessionId,
    }),
  getCapstoneByNodeId: (simulationNodeId: string, sessionId: string) =>
    trainingCapstoneRepository.getCapstoneByNodeId({
      db,
      simulationNodeId,
      sessionId,
    }),
  listCapstoneMessages: (capstoneId: string) =>
    trainingCapstoneRepository.listMessages({
      db,
      capstoneId,
    }),
  saveCapstone: (payload: {
    simulationNodeId: string;
    planId: string;
    sessionId: string;
    userId?: string | null;
    scenario: Parameters<
      typeof trainingCapstoneRepository.saveCapstone
    >[0]["scenario"];
    maxRounds: number;
  }) =>
    trainingCapstoneRepository.saveCapstone({
      db,
      ...payload,
    }),
  appendCapstoneMessage: (payload: {
    capstoneId: string;
    role: Parameters<
      typeof trainingCapstoneRepository.appendMessage
    >[0]["role"];
    content: string;
    sequence: number;
    round: number;
  }) =>
    trainingCapstoneRepository.appendMessage({
      db,
      ...payload,
    }),
  getUnitByNodeId: (nodeId: string) =>
    trainingCurriculumRepository.getUnitByNodeId({
      db,
      nodeId,
    }),
  listLatestAttemptsByUnitIds: (sessionId: string, unitIds: string[]) =>
    trainingAttemptRepository.listLatestAttemptsByUnitIds({
      db,
      sessionId,
      unitIds,
    }),
});

const createCapstoneSubmissionDeps = (
  db: Database,
): Parameters<typeof submitCapstoneMessageWorkflow>[0]["deps"] => ({
  getNodeById: (nodeId: string) =>
    trainingCurriculumRepository.getNodeById({
      db,
      nodeId,
    }),
  getCapstoneByNodeId: (simulationNodeId: string, sessionId: string) =>
    trainingCapstoneRepository.getCapstoneByNodeId({
      db,
      simulationNodeId,
      sessionId,
    }),
  listCapstoneMessages: (capstoneId: string) =>
    trainingCapstoneRepository.listMessages({
      db,
      capstoneId,
    }),
  appendCapstoneMessage: (payload: {
    capstoneId: string;
    role: Parameters<
      typeof trainingCapstoneRepository.appendMessage
    >[0]["role"];
    content: string;
    sequence: number;
    round: number;
  }) =>
    trainingCapstoneRepository.appendMessage({
      db,
      ...payload,
    }),
  updateCapstone: (payload: {
    capstoneId: string;
    status?: Parameters<
      typeof trainingCapstoneRepository.updateCapstone
    >[0]["status"];
    currentRound?: number;
    score?: number | null;
    feedback?: string | null;
  }) =>
    trainingCapstoneRepository.updateCapstone({
      db,
      ...payload,
    }),
  completeNode: async (nodeId: string) => {
    await trainingCurriculumRepository.completeNode({
      db,
      nodeId,
    });
  },
});

const getErrorCode = (message: string) => {
  if (message.includes("does not exist") || message.includes("not found")) {
    return "NOT_FOUND" as const;
  }

  if (
    message.includes("more specific") ||
    message.includes("fuller") ||
    message.includes("before") ||
    message.includes("Pass") ||
    message.includes("limit") ||
    message.includes("unlock") ||
    message.includes("unit is complete") ||
    message.includes("complete yet") ||
    message.includes("not active")
  ) {
    return "BAD_REQUEST" as const;
  }

  if (
    message.includes("OPENAI_API_KEY") ||
    message.includes("GOOGLE_GENERATIVE_AI_API_KEY") ||
    message.includes("Failed to generate")
  ) {
    return "BAD_REQUEST" as const;
  }

  return "INTERNAL_SERVER_ERROR" as const;
};

const throwOnFailure = <T>(result: {
  success: boolean;
  data?: T;
  error?: string;
}) => {
  if (result.success) {
    return result.data as T;
  }

  throw new TRPCError({
    code: getErrorCode(result.error ?? "Unknown error."),
    message: result.error ?? "Unknown error.",
  });
};

const requireSessionOwner = async ({
  ctx,
  sessionId,
}: {
  ctx: {
    db: Database;
    session: { user: { id: string } } | null;
  };
  sessionId: string;
}) => {
  const session = await trainingOnboardingRepository.getSession({
    db: ctx.db,
    sessionId,
  });

  if (!session) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Onboarding session does not exist.",
    });
  }

  const userId = ctx.session?.user.id;

  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in.",
    });
  }

  if (session.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this learning project.",
    });
  }

  return session;
};

const createGetUnitDependencies = (
  db: Database,
): Parameters<typeof getUnitWorkflow>[0]["deps"] => ({
  getPlanNodesBySession: (sessionId) =>
    trainingCurriculumRepository.getPlanNodesBySession({ db, sessionId }),
  getUnitByNodeId: (nodeId) =>
    trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
  getPhaseResponses: (unitContentId, sessionId) =>
    trainingCurriculumRepository.getPhaseResponses({
      db,
      unitContentId,
      sessionId,
    }),
});

const createPrepareUnitDependencies = (
  db: Database,
): Parameters<typeof prepareUnitWorkflow>[0]["deps"] => ({
  ...createUnitPreparationRepositoryDeps(db),
  getPhaseResponses: (unitContentId, sessionId) =>
    trainingCurriculumRepository.getPhaseResponses({
      db,
      unitContentId,
      sessionId,
    }),
  saveNodeBriefing: (payload) =>
    trainingCurriculumRepository.saveNodeBriefing({ db, ...payload }),
});

export const trainingRouter = {
  createLearningProject: protectedProcedure
    .input(CreateLearningProjectSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const db = tx as unknown as Database;

        return throwOnFailure(
          await createLearningProjectWorkflow({
            userId: ctx.session.user.id,
            title: input.title,
            targetIdentity: input.targetIdentity,
            curriculumMarkdown: input.curriculumMarkdown,
            deps: {
              createSession: (userId) =>
                trainingOnboardingRepository.createSession({ db, userId }),
              createProfileVersion: (payload) =>
                trainingOnboardingRepository.createProfileVersion({
                  db,
                  ...payload,
                }),
              createPlan: (payload) =>
                trainingCurriculumRepository.createPlan({
                  db,
                  ...payload,
                }),
              updateSession: (payload) =>
                trainingOnboardingRepository.updateSession({
                  db,
                  ...payload,
                }),
            },
          }),
        );
      }),
    ),

  startOnboarding: protectedProcedure.mutation(async ({ ctx }) =>
    throwOnFailure(
      await startOnboardingWorkflow({
        userId: ctx.session.user.id,
        deps: {
          createSession: (userId) =>
            trainingOnboardingRepository.createSession({ db: ctx.db, userId }),
          appendMessage: (input) =>
            trainingOnboardingRepository.appendMessage({
              db: ctx.db,
              ...input,
            }),
        },
      }),
    ),
  ),

  onboardingState: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      const state = await trainingOnboardingRepository.getOnboardingState({
        db: ctx.db,
        sessionId: input.sessionId,
      });

      if (!state) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Onboarding session does not exist.",
        });
      }

      return state;
    }),

  // Rehydrate the latest onboarding session, including its completed build
  // card. Starting a new project is an explicit route state and bypasses this
  // query, so reload and "new project" no longer have ambiguous semantics.
  resumeOnboarding: protectedProcedure.query(async ({ ctx }) => {
    const session =
      await trainingOnboardingRepository.getLatestOnboardingSession({
        db: ctx.db,
        userId: ctx.session.user.id,
      });
    if (!session) return null;

    return trainingOnboardingRepository.getOnboardingState({
      db: ctx.db,
      sessionId: session.id,
    });
  }),

  listLearningProjects: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await trainingOnboardingRepository.listSessionsByUser({
      db: ctx.db,
      userId: ctx.session.user.id,
    });
    const sessionIds = sessions.map((session) => session.id);
    const [profiles, plans, firstUserMessages] = await Promise.all([
      trainingOnboardingRepository.listProfilesBySessionIds({
        db: ctx.db,
        sessionIds,
      }),
      trainingCurriculumRepository.listPlansBySessionIds({
        db: ctx.db,
        sessionIds,
      }),
      trainingOnboardingRepository.listFirstUserMessagesBySessionIds({
        db: ctx.db,
        sessionIds,
      }),
    ]);

    const profileBySessionId = new Map(
      profiles.map(({ profile, version }) => [
        profile.onboardingSessionId,
        {
          targetIdentity: version.targetIdentity,
          headline: version.headline,
        },
      ]),
    );
    const planBySessionId = new Map(
      plans.map((plan) => [plan.onboardingSessionId, plan]),
    );
    const firstUserMessageBySessionId = new Map(
      firstUserMessages.map((message) => [message.sessionId, message.content]),
    );

    const nodes = await trainingCurriculumRepository.listNodesByPlanIds({
      db: ctx.db,
      planIds: plans.map((plan) => plan.id),
    });
    const sessionIdByPlanId = new Map(
      plans.map((plan) => [plan.id, plan.onboardingSessionId]),
    );
    const projectNodesBySessionId = new Map<string, typeof nodes>();

    for (const node of nodes) {
      const sessionId = sessionIdByPlanId.get(node.planId);
      if (!sessionId) {
        continue;
      }

      const existing = projectNodesBySessionId.get(sessionId);
      if (existing) {
        existing.push(node);
      } else {
        projectNodesBySessionId.set(sessionId, [node]);
      }
    }

    return sessions.flatMap((session) => {
      const profile = profileBySessionId.get(session.id) ?? null;
      const plan = planBySessionId.get(session.id) ?? null;
      // `||` (not `??`) is deliberate: a blank title should fall through.
      const planTitle = plan?.title.trim() ?? "";
      const identityTitle = profile?.targetIdentity.trim() ?? "";
      const title =
        planTitle ||
        identityTitle ||
        deriveProvisionalProjectTitle(
          firstUserMessageBySessionId.get(session.id) ?? "",
        );

      // An untouched onboarding session has no learner intent to distinguish it
      // from other abandoned starts, so it should not occupy navigation space.
      if (!title) return [];

      const planNodes = projectNodesBySessionId.get(session.id) ?? [];
      const lessonPreview = planNodes
        .filter((node) => node.kind === "unit" || node.kind === "integration")
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .slice(0, 3)
        .map((node) => ({
          id: node.id,
          title: node.title,
          status: node.status,
        }));

      return [
        {
          sessionId: session.id,
          title,
          headline:
            profile?.headline ?? plan?.summary ?? "Interview in progress.",
          status:
            plan?.status === "active"
              ? "active"
              : plan // a "generating" shell exists but isn't finished yet
                ? "building"
                : session.status === "ready_for_generation" ||
                    session.status === "complete"
                  ? "building"
                  : "onboarding",
          lessonPreview,
          updatedAt: session.updatedAt ?? session.createdAt,
        },
      ];
    });
  }),

  // Backs the workspace command palette (⌘K): every project with its full chat
  // list. Ownership is enforced by scoping the session lookup to the caller.
  listWorkspaceIndex: protectedProcedure.query(async ({ ctx }) =>
    getWorkspaceIndexWorkflow({
      deps: {
        listSessionsByUser: () =>
          trainingOnboardingRepository.listSessionsByUser({
            db: ctx.db,
            userId: ctx.session.user.id,
          }),
        listProfilesBySessionIds: async (sessionIds) => {
          const profiles =
            await trainingOnboardingRepository.listProfilesBySessionIds({
              db: ctx.db,
              sessionIds,
            });
          return profiles.map(({ profile, version }) => ({
            onboardingSessionId: profile.onboardingSessionId,
            targetIdentity: version.targetIdentity,
          }));
        },
        listPlansBySessionIds: (sessionIds) =>
          trainingCurriculumRepository.listPlansBySessionIds({
            db: ctx.db,
            sessionIds,
          }),
        listNodesByPlanIds: (planIds) =>
          trainingCurriculumRepository.listNodesByPlanIds({
            db: ctx.db,
            planIds,
          }),
      },
    }),
  ),

  deleteLearningProject: protectedProcedure
    .input(SessionIdSchema)
    .mutation(async ({ ctx, input }) => {
      const deleted = await trainingOnboardingRepository.deleteSessionByUser({
        db: ctx.db,
        sessionId: input.sessionId,
        userId: ctx.session.user.id,
      });

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This learning project could not be found.",
        });
      }

      return { sessionId: deleted.id };
    }),

  activePlan: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await getActivePlanWorkflow({
          sessionId: input.sessionId,
          deps: {
            getActivePlan: (sessionId) =>
              trainingCurriculumRepository.getActivePlan({
                db: ctx.db,
                sessionId,
              }),
          },
        }),
      );
    }),

  projectOverview: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      const overview = await trainingCurriculumRepository.getProjectOverview({
        db: ctx.db,
        sessionId: input.sessionId,
      });

      if (!overview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project overview does not exist yet.",
        });
      }

      return overview;
    }),

  aiWorkspace: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      const result = await getAiWorkspaceWorkflow({
        sessionId: input.sessionId,
        deps: {
          getActivePlan: (sessionId) =>
            trainingCurriculumRepository.getActivePlan({
              db: ctx.db,
              sessionId,
            }),
          listMessages: (sessionId, slot) =>
            trainingOnboardingRepository.listWorkspaceMessages({
              db: ctx.db,
              sessionId,
              slot,
            }),
          listPhaseResponsesBySession: (sessionId) =>
            trainingCurriculumRepository.listPhaseResponsesBySession({
              db: ctx.db,
              sessionId,
            }),
          getPhaseResponses: (unitContentId, sessionId) =>
            trainingCurriculumRepository.getPhaseResponses({
              db: ctx.db,
              unitContentId,
              sessionId,
            }),
          getUnitRun: (sessionId, unitContentId) =>
            trainingUnitRunRepository.getUnitRun({
              db: ctx.db,
              sessionId,
              unitContentId,
            }),
          getUnitByNodeId: (nodeId) =>
            trainingCurriculumRepository.getUnitByNodeId({
              db: ctx.db,
              nodeId,
            }),
          getScenarioAttemptStartedAt: async ({
            scenarioAttemptId,
            nodeId,
          }) => {
            const attempt = await trainingRatingRepository.getOpenScenarioById({
              db: ctx.db,
              scenarioAttemptId,
              userId: ctx.session.user.id,
              nodeId,
            });

            return attempt?.presentedAt ?? null;
          },
        },
      });
      if (!result.success) {
        const failure = result.error;
        if (failure instanceof UnitNotReadyError) {
          return raiseUnitPreparationError(failure);
        }
        // `success: false` always throws; <never> keeps the return type sound.
        return throwOnFailure<never>({ success: false, error: failure });
      }
      return result.data;
    }),

  submitAiWorkspaceMessage: protectedProcedure
    .input(SubmitAiWorkspaceMessageSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      try {
        return throwOnFailure(
          await submitAiWorkspaceMessageWorkflow({
            sessionId: input.sessionId,
            userId: ctx.session.user.id,
            message: input.message,
            turnId: input.turnId ?? null,
            attemptTiming: input.attemptTiming ?? null,
            deps: createWorkspaceTurnRepositoryDeps(ctx.db),
          }),
        );
      } catch (error) {
        if (error instanceof UnitNotReadyError) {
          return raiseUnitPreparationError(error);
        }
        throw error;
      }
    }),

  continueLearningProject: protectedProcedure
    .input(SessionIdSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await continueLearningProjectWorkflow({
          sessionId: input.sessionId,
          deps: {
            getActivePlan: (sessionId) =>
              trainingCurriculumRepository.getActivePlan({
                db: ctx.db,
                sessionId,
              }),
            recoverSkillUnits: () =>
              recoverSkillUnits({
                db: ctx.db,
                sessionId: input.sessionId,
                userId: ctx.session.user.id,
                scheduleBackgroundTask: ctx.scheduleBackgroundTask,
              }),
            prepareUnit: ({ nodeId, sessionId }) =>
              prepareUnitWorkflow({
                nodeId,
                sessionId,
                deps: createPrepareUnitDependencies(ctx.db),
              }),
          },
        }),
      );
    }),

  prepareUnit: protectedProcedure
    .input(NodeSessionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await prepareUnitWorkflow({
          nodeId: input.nodeId,
          sessionId: input.sessionId,
          deps: createPrepareUnitDependencies(ctx.db),
        }),
      );
    }),

  advanceCompletedUnit: protectedProcedure
    .input(NodeSessionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await advanceCompletedUnitWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          deps: {
            withTransaction: (run) =>
              ctx.db.transaction(async (tx) => {
                const db = tx as unknown as Database;
                await db.execute(
                  sql`select pg_advisory_xact_lock(hashtext(${input.sessionId}), hashtext('advance-completed-unit'))`,
                );
                return run(createWorkspaceTurnRepositoryDeps(db));
              }),
            mintUnit: ({ clusterNodeId, sessionId, userId }) =>
              mintNextUnit({
                clusterNodeId,
                deps: createUnitMintingRepositoryDeps({
                  db: ctx.db,
                  sessionId,
                  userId,
                }),
              }),
            getMasteryState: ({ clusterNodeId, userId }) =>
              queryWithClient(ctx.db, () =>
                loadSkillMasteryState({
                  db: ctx.db,
                  clusterNodeId,
                  userId,
                }),
              ),
            openSimulation: (clusterNodeId) =>
              queryWithClient(ctx.db, () =>
                openSkillSimulation({ db: ctx.db, clusterNodeId }),
              ),
            scheduleBackgroundTask: ctx.scheduleBackgroundTask,
          },
        }),
      );
    }),

  unit: protectedProcedure
    .input(NodeSessionSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await getUnitWorkflow({
          nodeId: input.nodeId,
          sessionId: input.sessionId,
          deps: createGetUnitDependencies(ctx.db),
        }),
      );
    }),

  getCapstone: protectedProcedure
    .input(NodeSessionSchema)
    .query(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireSessionOwner({ ctx, sessionId: input.sessionId });

        const db = tx as unknown as Database;
        await lockCapstoneNode({
          db,
          nodeId: input.nodeId,
          sessionId: input.sessionId,
        });

        return throwOnFailure(
          await getCapstoneWorkflow({
            sessionId: input.sessionId,
            nodeId: input.nodeId,
            userId: ctx.session.user.id,
            deps: createCapstoneGenerationDeps(db),
          }),
        );
      }),
    ),

  generateCapstone: protectedProcedure
    .input(NodeSessionSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireSessionOwner({ ctx, sessionId: input.sessionId });

        const db = tx as unknown as Database;
        await lockCapstoneNode({
          db,
          nodeId: input.nodeId,
          sessionId: input.sessionId,
        });

        return throwOnFailure(
          await generateCapstoneWorkflow({
            sessionId: input.sessionId,
            nodeId: input.nodeId,
            userId: ctx.session.user.id,
            deps: createCapstoneGenerationDeps(db),
          }),
        );
      }),
    ),

  submitCapstoneMessage: protectedProcedure
    .input(SubmitCapstoneMessageSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireSessionOwner({ ctx, sessionId: input.sessionId });

        const db = tx as unknown as Database;
        await lockCapstoneNode({
          db,
          nodeId: input.nodeId,
          sessionId: input.sessionId,
        });

        const result = throwOnFailure(
          await submitCapstoneMessageWorkflow({
            sessionId: input.sessionId,
            nodeId: input.nodeId,
            response: input.response,
            deps: createCapstoneSubmissionDeps(db),
          }),
        );

        await trainingOnboardingRepository.touchSession({
          db,
          sessionId: input.sessionId,
        });

        return result;
      }),
    ),

  home: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await getHomeStateWorkflow({
          sessionId: input.sessionId,
          deps: {
            getHomeState: async (sessionId) => {
              const [
                profile,
                plan,
                summary,
                activeRecallGate,
                attemptHistory,
                nodeScores,
              ] = await Promise.all([
                trainingOnboardingRepository.getProfileBySession({
                  db: ctx.db,
                  sessionId,
                }),
                trainingCurriculumRepository.getActivePlan({
                  db: ctx.db,
                  sessionId,
                }),
                trainingAttemptRepository.getHomeSummary({
                  db: ctx.db,
                  sessionId,
                }),
                trainingRecallRepository.getActiveGateSummaryBySession({
                  db: ctx.db,
                  sessionId,
                }),
                trainingAttemptRepository.listAttemptHistory({
                  db: ctx.db,
                  sessionId,
                }),
                trainingAttemptRepository.listNodeScoresBySession({
                  db: ctx.db,
                  sessionId,
                }),
              ]);

              if (!profile || !plan || !summary) {
                return null;
              }

              const totalUnits = plan.nodes.filter(
                (node: CurriculumNode) =>
                  node.kind === "unit" || node.kind === "integration",
              ).length;
              const completedUnits = plan.nodes.filter(
                (node: CurriculumNode) =>
                  (node.kind === "unit" || node.kind === "integration") &&
                  node.status === "completed",
              ).length;
              const nextNode = plan.nodes.find(
                (node: CurriculumNode) => node.id === plan.nextUnitId,
              );

              const lastAttempt =
                attemptHistory.length > 0
                  ? attemptHistory[attemptHistory.length - 1]
                  : null;

              const recentDimensions = attemptHistory
                .slice(-10)
                .flatMap((a) => a.growthDimensions ?? []);
              const seen = new Set<string>();
              const demonstratedCapabilities: string[] = [];
              for (const dim of [...recentDimensions].reverse()) {
                if (!seen.has(dim)) {
                  seen.add(dim);
                  demonstratedCapabilities.unshift(dim);
                }
                if (demonstratedCapabilities.length >= 3) break;
              }

              return {
                targetIdentity: profile.version.targetIdentity,
                headline: profile.version.headline,
                planTitle: plan.title,
                planSummary: plan.summary,
                completedUnits,
                totalUnits,
                nextUnitId: plan.nextUnitId,
                nextUnitTitle:
                  summary.currentUnit?.title ??
                  (nextNode
                    ? nextNode.kind === "integration"
                      ? "Integration unit ready"
                      : nextNode.kind === "simulation"
                        ? "Cluster capstone ready"
                        : "Next unit ready"
                    : null),
                activeRecallGate,
                blockingSignals:
                  summary.recentFailureTags.length > 0
                    ? summary.recentFailureTags
                    : profile.version.confidenceFlags.length > 0
                      ? profile.version.confidenceFlags
                      : profile.version.behaviorSignals.slice(0, 3),
                lastCompletedUnit: lastAttempt
                  ? {
                      title: lastAttempt.title,
                      score: lastAttempt.score,
                      failureTags: lastAttempt.failureTags,
                    }
                  : null,
                demonstratedCapabilities,
                nodeScores,
              };
            },
          },
        }),
      );
    }),

  profile: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await getProfileWorkflow({
          sessionId: input.sessionId,
          deps: {
            getProfileState: async (sessionId) => {
              const profile =
                await trainingOnboardingRepository.getProfileBySession({
                  db: ctx.db,
                  sessionId,
                });
              if (!profile) {
                return null;
              }

              return {
                targetIdentity: profile.version.targetIdentity,
                headline: profile.version.headline,
                motivation: profile.version.motivation,
                currentBaseline: profile.version.currentBaseline,
                proofOfProgress: profile.version.proofOfProgress,
                hardMoments: profile.version.hardMoments,
                constraints: profile.version.constraints,
                behaviorSignals: profile.version.behaviorSignals,
              };
            },
          },
        }),
      );
    }),
} satisfies TRPCRouterRecord;
