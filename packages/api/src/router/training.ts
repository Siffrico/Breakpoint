import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { StartingPointTier } from "@acme/validators";
import { sql } from "@acme/db";
import {
  CapstoneSubmissionSchema,
  StartingPointTierSchema,
  WorkspaceBootstrapInputSchema,
} from "@acme/validators";

import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
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
import { getProjectTopicWorkflow } from "../domain/training/workflows/get-project-topic-workflow";
import { getUnitWorkflow } from "../domain/training/workflows/get-unit-workflow";
import { getWorkspaceBootstrapWorkflow } from "../domain/training/workflows/get-workspace-bootstrap-workflow";
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
import { trainingUnitRunRepository } from "../repositories/training-unit-run-repository";
import { trainingWorkspaceReadRepository } from "../repositories/training-workspace-read-repository";
import {
  createUnitCreationRepositoryDeps,
  loadSkillMasteryState,
  openSkillSimulation,
} from "../repositories/unit-creation-repository-deps";
import { createUnitPreparationRepositoryDeps } from "../repositories/unit-preparation-repository-deps";
import {
  createWorkspaceTurnRepositoryDeps,
  workspaceTurnRepoLayer,
} from "../repositories/workspace-turn-repository-deps";
import { protectedProcedure } from "../trpc";

const SessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const SetStartingPointSchema = z.object({
  sessionId: z.string().uuid(),
  tier: StartingPointTierSchema,
});

// Plain-language label the [change] control stamps when the learner overrides
// the elicited tier. The mid-chat tap carries the learner's own tapped text; a
// manual override has no tapped text, so we use these instead.
const STARTING_POINT_OVERRIDE_LABEL: Record<StartingPointTier, string> = {
  fundamentals: "starting from the fundamentals",
  skip_basics: "skipping the basics",
  advanced: "straight to the hard stuff",
};

const SubmitAiWorkspaceMessageSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(8_000),
  turnId: z.string().min(1).max(96),
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
    message.includes("limit") ||
    message.includes("unlock") ||
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

const createGetAiWorkspaceDependencies = (db: Database, userId: string) => ({
  ...createWorkspaceTurnRepositoryDeps(db),
  getScenarioAttemptStartedAt: async ({
    scenarioAttemptId,
    nodeId,
  }: {
    scenarioAttemptId: string;
    nodeId: string;
  }) => {
    const attempt = await trainingRatingRepository.getOpenScenarioById({
      db,
      scenarioAttemptId,
      userId,
      nodeId,
    });
    return attempt?.presentedAt ?? null;
  },
});

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

  // Manual override for the confirm card's [change] control. The mid-chat tap
  // needs no endpoint (it rides the tool result); this only exists so a learner
  // can correct the elicited tier before approving the build.
  setStartingPoint: protectedProcedure
    .input(SetStartingPointSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      await trainingOnboardingRepository.setStartingPoint({
        db: ctx.db,
        sessionId: input.sessionId,
        tier: input.tier,
        label: STARTING_POINT_OVERRIDE_LABEL[input.tier],
      });

      return { tier: input.tier };
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

  listLearningProjects: protectedProcedure.query(({ ctx }) =>
    trainingWorkspaceReadRepository.listLearningProjectsForUser({
      db: ctx.db,
      userId: ctx.session.user.id,
    }),
  ),

  workspaceBootstrap: protectedProcedure
    .input(WorkspaceBootstrapInputSchema)
    .query(async ({ ctx, input }) => {
      const result = await getWorkspaceBootstrapWorkflow({
        sessionId: input.sessionId,
        cookieSessionId: input.cookieSessionId,
        deps: {
          listProjects: () =>
            trainingWorkspaceReadRepository.listLearningProjectsForUser({
              db: ctx.db,
              userId: ctx.session.user.id,
            }),
          ownsSession: async (sessionId) => {
            const session = await trainingOnboardingRepository.getSession({
              db: ctx.db,
              sessionId,
            });
            return session?.userId === ctx.session.user.id;
          },
          getActivePlan: (sessionId) =>
            trainingCurriculumRepository.getActivePlan({
              db: ctx.db,
              sessionId,
            }),
          getHomeState: (sessionId) =>
            trainingWorkspaceReadRepository.getHomeState({
              db: ctx.db,
              sessionId,
            }),
          getAiWorkspace: (sessionId) =>
            getAiWorkspaceWorkflow({
              sessionId,
              deps: createGetAiWorkspaceDependencies(
                ctx.db,
                ctx.session.user.id,
              ),
            }),
          getOnboardingState: (sessionId) =>
            trainingOnboardingRepository.getOnboardingState({
              db: ctx.db,
              sessionId,
            }),
          getUnit: (sessionId, nodeId) =>
            getUnitWorkflow({
              sessionId,
              nodeId,
              deps: createGetUnitDependencies(ctx.db),
            }),
        },
      });
      if (!result.success) {
        if (result.error instanceof UnitNotReadyError) {
          return raiseUnitPreparationError(result.error);
        }
        return throwOnFailure<never>({
          success: false,
          error: result.error,
        });
      }
      return result.data;
    }),

  // Read-only transcript of one past chat (a unit's slice of the workspace
  // conversation). Ownership is enforced before any message read, and the node
  // must belong to the session's own plan.
  chatHistory: protectedProcedure
    .input(
      z.object({ sessionId: z.string().uuid(), nodeId: z.string().uuid() }),
    )
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      const nodes =
        (await trainingCurriculumRepository.getPlanNodesBySession({
          db: ctx.db,
          sessionId: input.sessionId,
        })) ?? [];
      const node = nodes.find((candidate) => candidate.id === input.nodeId);
      if (!node) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This chat does not belong to the project.",
        });
      }

      const messages =
        await trainingOnboardingRepository.listWorkspaceMessagesByUnit({
          db: ctx.db,
          sessionId: input.sessionId,
          unitId: input.nodeId,
        });

      return {
        node: {
          id: node.id,
          title: node.title,
          status: node.status,
          kind: node.kind,
        },
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          sequence: message.sequence,
        })),
      };
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
        listFirstUserMessagesBySessionIds: (sessionIds) =>
          trainingOnboardingRepository.listFirstUserMessagesBySessionIds({
            db: ctx.db,
            sessionIds,
          }),
        listChatUnitIdsBySessionIds: (sessionIds) =>
          trainingOnboardingRepository.listChatUnitIdsBySessionIds({
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

  // Per-topic standing: skill clusters joined to their live Glicko rating, plus
  // the generated overview. Backs the settings Topics detail page.
  projectTopic: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await getProjectTopicWorkflow({
          sessionId: input.sessionId,
          deps: {
            getActivePlan: (sessionId) =>
              trainingCurriculumRepository.getActivePlan({
                db: ctx.db,
                sessionId,
              }),
            getProjectOverview: (sessionId) =>
              trainingCurriculumRepository.getProjectOverview({
                db: ctx.db,
                sessionId,
              }),
            getJobProgress: (nodeIds) =>
              trainingRatingRepository.listJobProgressByNodeIds({
                db: ctx.db,
                userId: ctx.session.user.id,
                nodeIds,
              }),
          },
        }),
      );
    }),

  aiWorkspace: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      const [result] = await Promise.all([
        getAiWorkspaceWorkflow({
          sessionId: input.sessionId,
          deps: createGetAiWorkspaceDependencies(ctx.db, ctx.session.user.id),
        }),
        requireSessionOwner({ ctx, sessionId: input.sessionId }),
      ]);
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
        const result = await submitAiWorkspaceMessageWorkflow({
          sessionId: input.sessionId,
          userId: ctx.session.user.id,
          message: input.message,
          turnId: input.turnId,
          deps: createWorkspaceTurnRepositoryDeps(ctx.db),
          workspaceTurnRepoLayer: workspaceTurnRepoLayer(ctx.db),
        });
        if (result.success) return result.data;
        if (result.error instanceof TRPCError) throw result.error;
        return throwOnFailure<never>({
          success: false,
          error:
            typeof result.error === "string"
              ? result.error
              : result.error.message,
        });
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
                return run({
                  getActivePlan: (sessionId) =>
                    trainingCurriculumRepository.getActivePlan({
                      db,
                      sessionId,
                    }),
                  getUnitByNodeId: (nodeId) =>
                    trainingCurriculumRepository.getUnitByNodeId({
                      db,
                      nodeId,
                    }),
                  getUnitRun: (sessionId, unitContentId) =>
                    trainingUnitRunRepository.getUnitRun({
                      db,
                      sessionId,
                      unitContentId,
                    }),
                  completeNode: (nodeId) =>
                    trainingCurriculumRepository.completeNode({ db, nodeId }),
                  touchSession: (sessionId) =>
                    trainingOnboardingRepository.touchSession({
                      db,
                      sessionId,
                    }),
                });
              }),
            createUnit: ({ clusterNodeId, sessionId, userId }) =>
              createNextUnit({
                clusterNodeId,
                deps: createUnitCreationRepositoryDeps({
                  db: ctx.db,
                  sessionId,
                  userId,
                }),
              }),
            getMasteryState: ({ clusterNodeId, userId }) =>
              queryWithClient(ctx.db, "loadSkillMasteryState", () =>
                loadSkillMasteryState({
                  db: ctx.db,
                  clusterNodeId,
                  userId,
                }),
              ),
            openSimulation: (clusterNodeId) =>
              queryWithClient(ctx.db, "openSkillSimulation", () =>
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
            getHomeState: (sessionId) =>
              trainingWorkspaceReadRepository.getHomeState({
                db: ctx.db,
                sessionId,
              }),
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
