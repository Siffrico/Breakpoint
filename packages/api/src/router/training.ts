import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { StartingPointTier } from "@acme/validators";
import { sql } from "@acme/db";
import {
  StartingPointTierSchema,
  WorkspaceShellInputSchema,
} from "@acme/validators";

import type { RequestReads } from "../lib/request-reads";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import { ADVANCE_COMPLETED_UNIT_LOCK_KEY } from "../domain/training/unit-creation/pregenerate-next-unit";
import { UnitNotReadyError } from "../domain/training/unit-preparation/errors";
import { raiseUnitPreparationError } from "../domain/training/unit-preparation/prepare-unit-edge";
import { advanceCompletedUnitWorkflow } from "../domain/training/workflows/advance-completed-unit-workflow";
import { continueLearningProjectWorkflow } from "../domain/training/workflows/continue-learning-project-workflow";
import { createLearningProjectWorkflow } from "../domain/training/workflows/create-learning-project-workflow";
import { getActivePlanWorkflow } from "../domain/training/workflows/get-active-plan-workflow";
import { getAiWorkspaceWorkflow } from "../domain/training/workflows/get-ai-workspace-workflow";
import { getHomeStateWorkflow } from "../domain/training/workflows/get-home-state-workflow";
import { getProfileWorkflow } from "../domain/training/workflows/get-profile-workflow";
import { getProjectTopicWorkflow } from "../domain/training/workflows/get-project-topic-workflow";
import { getUnitWorkflow } from "../domain/training/workflows/get-unit-workflow";
import { getWorkspaceIndexWorkflow } from "../domain/training/workflows/get-workspace-index-workflow";
import { getWorkspaceShellWorkflow } from "../domain/training/workflows/get-workspace-shell-workflow";
import { listUnfinishedOnboardingSessionsWorkflow } from "../domain/training/workflows/list-unfinished-onboarding-sessions-workflow";
import { prepareUnitWorkflow } from "../domain/training/workflows/prepare-unit-workflow";
import { startOnboardingWorkflow } from "../domain/training/workflows/start-onboarding-workflow";
import { queryWithClient } from "../effect/db";
import { buildProjectCheckpointRepository } from "../repositories/build-project-checkpoint-repository";
import { recoverSkillUnits } from "../repositories/build-project-repository-deps";
import { missionRepository } from "../repositories/mission-repository";
import { trainingCurriculumRepository } from "../repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "../repositories/training-onboarding-repository";
import { trainingRatingRepository } from "../repositories/training-rating-repository";
import { trainingUnitRunRepository } from "../repositories/training-unit-run-repository";
import { trainingWorkspaceReadRepository } from "../repositories/training-workspace-read-repository";
import {
  advanceSkillMapNode,
  createUnitCreationRepositoryDeps,
  loadProgressionState,
} from "../repositories/unit-creation-repository-deps";
import { awaitUnitBuildSettled } from "../repositories/unit-build-lock";
import { createUnitPreparationRepositoryDeps } from "../repositories/unit-preparation-repository-deps";
import { createWorkspaceTurnRepositoryDeps } from "../repositories/workspace-turn-repository-deps";
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

const NodeSessionSchema = z.object({
  nodeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

// How long awaitUnit parks on the build lock before telling the client to
// re-park. Kept under serverless response limits; each parked request holds
// one pooled DB connection, so the bound also caps connection dwell time.
const AWAIT_UNIT_TIMEOUT_MS = 20_000;

const CreateLearningProjectSchema = z.object({
  title: z.string().min(2).max(120),
  targetIdentity: z.string().max(240).optional(),
  curriculumMarkdown: z.string().max(120_000).optional(),
});

type Database = Parameters<
  typeof trainingCurriculumRepository.getNodeById
>[0]["db"];

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

const createGetAiWorkspaceDependencies = (
  db: Database,
  userId: string,
  reads?: RequestReads,
) => ({
  ...createWorkspaceTurnRepositoryDeps(db, reads),
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
    reads: RequestReads;
    session: { user: { id: string } } | null;
  };
  sessionId: string;
}) => {
  const session = await ctx.reads.getSession(sessionId);

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
  reads?: RequestReads,
): Parameters<typeof getUnitWorkflow>[0]["deps"] => ({
  getPlanNodesBySession: (sessionId) =>
    reads
      ? // Narrower than the repo read: getActivePlan yields nodes only for an
        // ACTIVE plan, while getPlanNodesBySession also returns them while the
        // plan is still generating. Safe here because callers only reach the
        // unit workflow once a plan is active; revisit if that changes.
        reads.getActivePlan(sessionId).then((plan) => plan?.nodes ?? null)
      : trainingCurriculumRepository.getPlanNodesBySession({ db, sessionId }),
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

  listUnfinishedOnboardings: protectedProcedure.query(({ ctx }) =>
    listUnfinishedOnboardingSessionsWorkflow({
      deps: {
        listSessions: () =>
          trainingOnboardingRepository.listSessionsByUser({
            db: ctx.db,
            userId: ctx.session.user.id,
          }),
        listFirstUserMessages: (sessionIds) =>
          trainingOnboardingRepository.listFirstUserMessagesBySessionIds({
            db: ctx.db,
            sessionIds,
          }),
        listBuildRuns: (sessionIds) =>
          buildProjectCheckpointRepository.listRunsBySessionIds({
            db: ctx.db,
            sessionIds,
          }),
      },
    }),
  ),

  listLearningProjects: protectedProcedure.query(({ ctx }) =>
    trainingWorkspaceReadRepository.listLearningProjectsForUser({
      db: ctx.db,
      userId: ctx.session.user.id,
    }),
  ),

  workspaceShell: protectedProcedure
    .input(WorkspaceShellInputSchema)
    .query(async ({ ctx, input }) =>
      throwOnFailure(
        await getWorkspaceShellWorkflow({
          sessionId: input.sessionId,
          cookieSessionId: input.cookieSessionId,
          deps: {
            listProjects: () =>
              trainingWorkspaceReadRepository.listLearningProjectsForUser({
                db: ctx.db,
                userId: ctx.session.user.id,
              }),
            ownsSession: async (sessionId) => {
              const session = await ctx.reads.getSession(sessionId);
              return session?.userId === ctx.session.user.id;
            },
            getActivePlan: ctx.reads.getActivePlan,
            getOnboardingState: (sessionId) =>
              trainingOnboardingRepository.getOnboardingState({
                db: ctx.db,
                sessionId,
              }),
          },
        }),
      ),
    ),

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
            getActivePlan: ctx.reads.getActivePlan,
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

  // Per-topic standing: abilities joined to their live Glicko rating, plus
  // the generated overview. Backs the settings Topics detail page.
  projectTopic: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await getProjectTopicWorkflow({
          sessionId: input.sessionId,
          deps: {
            getActivePlan: ctx.reads.getActivePlan,
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
      await requireSessionOwner({ ctx, sessionId: input.sessionId });
      const result = await getAiWorkspaceWorkflow({
        sessionId: input.sessionId,
        deps: createGetAiWorkspaceDependencies(
          ctx.db,
          ctx.session.user.id,
          ctx.reads,
        ),
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

  continueLearningProject: protectedProcedure
    .input(SessionIdSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await continueLearningProjectWorkflow({
          sessionId: input.sessionId,
          deps: {
            // Not ctx.reads: the workflow re-reads the plan after
            // recoverSkillUnits writes, so a memoized read would be stale.
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

      const result = throwOnFailure(
        await advanceCompletedUnitWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          deps: {
            withTransaction: (run) =>
              ctx.db.transaction(async (tx) => {
                const db = tx as unknown as Database;
                await db.execute(
                  sql`select pg_advisory_xact_lock(hashtext(${input.sessionId}), hashtext(${ADVANCE_COMPLETED_UNIT_LOCK_KEY}))`,
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
                  markNodeReady: (nodeId) =>
                    trainingCurriculumRepository.markNodeReady({ db, nodeId }),
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
            getProgressionState: ({ clusterNodeId, userId }) =>
              queryWithClient(ctx.db, "loadProgressionState", () =>
                loadProgressionState({
                  db: ctx.db,
                  clusterNodeId,
                  userId,
                }),
              ),
            getMissionStatus: async ({ sessionId, unitContentId, userId }) => {
              const unitRunId = await missionRepository.findUnitRunId({
                db: ctx.db,
                userId,
                unitContentId,
                sessionId,
              });
              if (!unitRunId) return null;
              const mission = await missionRepository.getByUnitRun({
                db: ctx.db,
                unitRunId,
                userId,
              });
              return { unitRunId, status: mission?.status ?? null };
            },
            advanceSkillMapNode: ({ clusterNodeId, sessionId, userId }) =>
              queryWithClient(ctx.db, "advanceSkillMapNode", () =>
                advanceSkillMapNode({
                  db: ctx.db,
                  nodeId: clusterNodeId,
                  sessionId,
                  userId,
                }),
              ),
            scheduleBackgroundTask: ctx.scheduleBackgroundTask,
          },
        }),
      );
      if (!result.advanced) return result;
      return {
        advanced: true as const,
        nextChat: result.nextReadyNode
          ? {
              nodeId: result.nextReadyNode.id,
              title: result.nextReadyNode.title,
            }
          : null,
      };
    }),

  unit: protectedProcedure
    .input(NodeSessionSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await getUnitWorkflow({
          nodeId: input.nodeId,
          sessionId: input.sessionId,
          deps: createGetUnitDependencies(ctx.db, ctx.reads),
        }),
      );
    }),

  // Bounded long-poll for unit readiness: parks on the unit-build advisory
  // lock and returns at the builder's commit (or at the deadline), so waiting
  // clients hold one open request instead of polling. Read-only — it never
  // triggers unit generation.
  awaitUnit: protectedProcedure
    .input(NodeSessionSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      // The node must belong to this session's plan — without this check,
      // readiness would be a cross-tenant existence oracle for node ids.
      const planNodes = await trainingCurriculumRepository.getPlanNodesBySession(
        { db: ctx.db, sessionId: input.sessionId },
      );
      if (!planNodes?.some((node) => node.id === input.nodeId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Unit node does not exist in this learning project.",
        });
      }

      await awaitUnitBuildSettled({
        db: ctx.db,
        nodeId: input.nodeId,
        timeoutMs: AWAIT_UNIT_TIMEOUT_MS,
      });
      const unit = await trainingCurriculumRepository.getUnitByNodeId({
        db: ctx.db,
        nodeId: input.nodeId,
      });
      return { ready: Boolean(unit) };
    }),

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
