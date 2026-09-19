import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { StartingPointTier } from "@acme/validators";
import { sql } from "@acme/db";
import {
  StartingPointTierSchema,
  WorkspaceShellInputSchema,
} from "@acme/validators";

import { getMissionStatusWorkflow } from "../domain/training/missions/workflows/get-mission-status";
import { prepareRecallWorkflow } from "../domain/training/recall/workflows/prepare-recall";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import { ADVANCE_COMPLETED_UNIT_LOCK_KEY } from "../domain/training/unit-creation/pregenerate-next-unit";
import { advanceCompletedUnitWorkflow } from "../domain/training/workflows/advance-completed-unit-workflow";
import { continueLearningProjectWorkflow } from "../domain/training/workflows/continue-learning-project-workflow";
import { createLearningProjectWorkflow } from "../domain/training/workflows/create-learning-project-workflow";
import { getActivePlanWorkflow } from "../domain/training/workflows/get-active-plan-workflow";
import { getAiWorkspaceWorkflow } from "../domain/training/workflows/get-ai-workspace-workflow";
import { getHomeStateWorkflow } from "../domain/training/workflows/get-home-state-workflow";
import { getProfileWorkflow } from "../domain/training/workflows/get-profile-workflow";
import { getProjectTopicWorkflow } from "../domain/training/workflows/get-project-topic-workflow";
import { getUnitReadinessWorkflow } from "../domain/training/workflows/get-unit-readiness-workflow";
import { getUnitWorkflow } from "../domain/training/workflows/get-unit-workflow";
import { getWorkspaceIndexWorkflow } from "../domain/training/workflows/get-workspace-index-workflow";
import { getWorkspaceShellWorkflow } from "../domain/training/workflows/get-workspace-shell-workflow";
import { listUnfinishedOnboardingSessionsWorkflow } from "../domain/training/workflows/list-unfinished-onboarding-sessions-workflow";
import { prepareUnitWorkflow } from "../domain/training/workflows/prepare-unit-workflow";
import { startOnboardingWorkflow } from "../domain/training/workflows/start-onboarding-workflow";
import { queryWithClient } from "../effect/db";
import { buildProjectCheckpointRepository } from "../repositories/build-project-checkpoint-repository";
import { trainingCurriculumRepository } from "../repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "../repositories/training-onboarding-repository";
import { trainingRatingRepository } from "../repositories/training-rating-repository";
import { trainingUnitRunRepository } from "../repositories/training-unit-run-repository";
import { trainingWorkspaceReadRepository } from "../repositories/training-workspace-read-repository";
import { awaitUnitBuildSettled } from "../repositories/unit-build-lock";
import {
  advanceSkillMapNode,
  createUnitCreationRepositoryDeps,
  loadProgressionState,
} from "../repositories/unit-creation-repository-deps";
import { createUnitPreparationRepositoryDeps } from "../repositories/unit-preparation-repository-deps";
import { createWorkspaceTurnRepositoryDeps } from "../repositories/workspace-turn-repository-deps";
import { protectedProcedure } from "../trpc";
import { runEffect, runMission, runRecall } from "./run-effect";

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
const AWAIT_UNIT_START_GRACE_MS = 1_000;

const CreateLearningProjectSchema = z.object({
  title: z.string().min(2).max(120),
  targetIdentity: z.string().max(240).optional(),
});

type Database = Parameters<
  typeof trainingCurriculumRepository.getNodeById
>[0]["db"];

const throwOnFailure = <T>(
  result: {
    success: boolean;
    data?: T;
    error?: string;
  },
  code: "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR",
) => {
  if (result.success) {
    return result.data as T;
  }

  throw new TRPCError({
    code,
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
            deps: {
              createSession: (userId) =>
                trainingOnboardingRepository.createSession({ db, userId }),
              createProfileVersion: (payload) =>
                trainingOnboardingRepository.createProfileVersion({
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
          "INTERNAL_SERVER_ERROR",
        );
      }),
    ),

  startOnboarding: protectedProcedure.mutation(async ({ ctx }) =>
    throwOnFailure(
      await startOnboardingWorkflow({
        userId: ctx.session.user.id,
        deps: {
          createSession: ({ userId }) =>
            trainingOnboardingRepository.createSession({
              db: ctx.db,
              userId,
            }),
          appendMessage: (message) =>
            trainingOnboardingRepository.appendMessage({
              db: ctx.db,
              ...message,
              slot: null,
            }),
        },
      }),
      "INTERNAL_SERVER_ERROR",
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

  /**
   * The durable build state for one session. This is what makes the build
   * survive a dropped connection: the SSE stream is a live view, this row is
   * the record. Ownership is checked here because the checkpoint is keyed by
   * session, not by user.
   */
  getBuildRun: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await trainingOnboardingRepository.getSession({
        db: ctx.db,
        sessionId: input.sessionId,
      });
      if (!session || session.userId !== ctx.session.user.id) return null;
      const run = await buildProjectCheckpointRepository.getRun({
        db: ctx.db,
        sessionId: input.sessionId,
      });
      return run ? run.state : null;
    }),

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
            getOnboardingState: (sessionId) =>
              trainingOnboardingRepository.getOnboardingState({
                db: ctx.db,
                sessionId,
              }),
          },
        }),
        "NOT_FOUND",
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
            getActivePlan: (sessionId) =>
              trainingCurriculumRepository.getActivePlan({
                db: ctx.db,
                sessionId,
              }),
          },
        }),
        "NOT_FOUND",
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
        "NOT_FOUND",
      );
    }),

  aiWorkspace: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });
      const workspace = throwOnFailure(
        await getAiWorkspaceWorkflow({
          sessionId: input.sessionId,
          deps: createWorkspaceTurnRepositoryDeps(ctx.db, ctx.session.user.id),
        }),
        "BAD_REQUEST",
      );
      if (workspace.kind === "ready") {
        const prepareRecall = () =>
          runRecall(
            ctx.db,
            prepareRecallWorkflow({
              userId: ctx.session.user.id,
              sessionId: input.sessionId,
              planId: workspace.workspace.plan.id,
              now: new Date(),
            }),
          )
            .then(() => undefined)
            .catch(() => undefined);
        if (ctx.scheduleBackgroundTask) {
          ctx.scheduleBackgroundTask(prepareRecall);
        } else {
          void prepareRecall();
        }
      }
      return workspace;
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
            hasUnitContent: async (nodeId) =>
              Boolean(
                await trainingCurriculumRepository.getUnitByNodeId({
                  db: ctx.db,
                  nodeId,
                }),
              ),
          },
        }),
        "BAD_REQUEST",
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
        "BAD_REQUEST",
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
            createUnit: ({
              skillNodeId,
              sessionId,
              userId,
              excludeUnitNodeId,
            }) =>
              createNextUnit({
                skillNodeId,
                excludeUnitNodeId,
                deps: createUnitCreationRepositoryDeps({
                  db: ctx.db,
                  sessionId,
                  userId,
                }),
              }),
            getProgressionState: ({ skillNodeId, userId, includeUnitNodeId }) =>
              runEffect(
                queryWithClient(ctx.db, "loadProgressionState", () =>
                  loadProgressionState({
                    db: ctx.db,
                    skillNodeId,
                    userId,
                    includeUnitNodeId,
                  }),
                ),
              ),
            getMissionStatus: ({ sessionId, unitContentId, userId }) =>
              runMission(
                ctx.db,
                getMissionStatusWorkflow({
                  userId,
                  unitContentId,
                  sessionId,
                }),
              ),
            advanceSkillMapNode: ({ skillNodeId, sessionId, userId }) =>
              queryWithClient(ctx.db, "advanceSkillMapNode", () =>
                advanceSkillMapNode({
                  db: ctx.db,
                  nodeId: skillNodeId,
                  sessionId,
                  userId,
                }),
              ),
            runProgressionEffect: runEffect,
            scheduleBackgroundTask: ctx.scheduleBackgroundTask,
          },
        }),
        "BAD_REQUEST",
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
          deps: createGetUnitDependencies(ctx.db),
        }),
        "NOT_FOUND",
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
      const planNodes =
        await trainingCurriculumRepository.getPlanNodesBySession({
          db: ctx.db,
          sessionId: input.sessionId,
        });
      if (!planNodes?.some((node) => node.id === input.nodeId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Unit node does not exist in this learning project.",
        });
      }

      return getUnitReadinessWorkflow({
        nodeId: input.nodeId,
        deps: {
          awaitBuildSettled: (nodeId) =>
            awaitUnitBuildSettled({
              db: ctx.db,
              nodeId,
              timeoutMs: AWAIT_UNIT_TIMEOUT_MS,
            }),
          getUnitByNodeId: (nodeId) =>
            trainingCurriculumRepository.getUnitByNodeId({
              db: ctx.db,
              nodeId,
            }),
          waitForStartGrace: () =>
            new Promise((resolve) =>
              setTimeout(resolve, AWAIT_UNIT_START_GRACE_MS),
            ),
        },
      });
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
        "BAD_REQUEST",
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
        "BAD_REQUEST",
      );
    }),
} satisfies TRPCRouterRecord;
