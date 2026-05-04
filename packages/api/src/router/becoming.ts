import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { sql } from "@acme/db";
import type { CurriculumNode } from "@acme/validators";
import {
  CapstoneSubmissionSchema,
} from "@acme/validators";

import {
  generateCapstoneWorkflow,
} from "../domain/becoming/workflows/generate-capstone-workflow";
import {
  getActivePlanWorkflow,
} from "../domain/becoming/workflows/get-active-plan-workflow";
import {
  getCapstoneWorkflow,
} from "../domain/becoming/workflows/get-capstone-workflow";
import {
  generateCurriculumWorkflow,
} from "../domain/becoming/workflows/generate-curriculum-workflow";
import {
  getHomeStateWorkflow,
} from "../domain/becoming/workflows/get-home-state-workflow";
import {
  getProfileWorkflow,
} from "../domain/becoming/workflows/get-profile-workflow";
import {
  getUnitWorkflow,
} from "../domain/becoming/workflows/get-unit-workflow";
import {
  getAiWorkspaceWorkflow,
} from "../domain/becoming/workflows/get-ai-workspace-workflow";
import {
  startOnboardingWorkflow,
} from "../domain/becoming/workflows/start-onboarding-workflow";
import {
  submitCapstoneMessageWorkflow,
} from "../domain/becoming/workflows/submit-capstone-message-workflow";
import {
  submitOnboardingAnswerWorkflow,
} from "../domain/becoming/workflows/submit-onboarding-answer-workflow";
import {
  submitAiWorkspaceMessageWorkflow,
} from "../domain/becoming/workflows/submit-ai-workspace-message-workflow";
import { becomingCapstoneRepository } from "../repositories/becoming-capstone-repository";
import { becomingCurriculumRepository } from "../repositories/becoming-curriculum-repository";
import { becomingOnboardingRepository } from "../repositories/becoming-onboarding-repository";
import { becomingRecallRepository } from "../repositories/becoming-recall-repository";
import { becomingTrainingRepository } from "../repositories/becoming-training-repository";
import { memoryRepository } from "../repositories/memory-repository";
import { publicProcedure, protectedProcedure } from "../trpc";

const SessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const SubmitOnboardingAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  answer: z.string().min(1).max(4_000),
});

const SubmitAiWorkspaceMessageSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(8_000),
});

const NodeSessionSchema = z.object({
  nodeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

const SubmitCapstoneMessageSchema = CapstoneSubmissionSchema.extend({
  sessionId: z.string().uuid(),
});
type Database = Parameters<
  typeof becomingCurriculumRepository.getNodeById
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
    becomingCurriculumRepository.getNodeById({
      db,
      nodeId,
    }),
  getPlanNodesBySession: (sessionId: string) =>
    becomingCurriculumRepository.getPlanNodesBySession({
      db,
      sessionId,
    }),
  getCapstoneByNodeId: (simulationNodeId: string, sessionId: string) =>
    becomingCapstoneRepository.getCapstoneByNodeId({
      db,
      simulationNodeId,
      sessionId,
    }),
  listCapstoneMessages: (capstoneId: string) =>
    becomingCapstoneRepository.listMessages({
      db,
      capstoneId,
    }),
  saveCapstone: (payload: {
    simulationNodeId: string;
    planId: string;
    sessionId: string;
    userId?: string | null;
    scenario: Parameters<typeof becomingCapstoneRepository.saveCapstone>[0]["scenario"];
    maxRounds: number;
  }) =>
    becomingCapstoneRepository.saveCapstone({
      db,
      ...payload,
    }),
  appendCapstoneMessage: (payload: {
    capstoneId: string;
    role: Parameters<typeof becomingCapstoneRepository.appendMessage>[0]["role"];
    content: string;
    sequence: number;
    round: number;
  }) =>
    becomingCapstoneRepository.appendMessage({
      db,
      ...payload,
    }),
  getUnitByNodeId: (nodeId: string) =>
    becomingCurriculumRepository.getUnitByNodeId({
      db,
      nodeId,
    }),
  listLatestAttemptsByUnitIds: (sessionId: string, unitIds: string[]) =>
    becomingTrainingRepository.listLatestAttemptsByUnitIds({
      db,
      sessionId,
      unitIds,
    }),
});

const createCapstoneSubmissionDeps = (
  db: Database,
): Parameters<typeof submitCapstoneMessageWorkflow>[0]["deps"] => ({
  getNodeById: (nodeId: string) =>
    becomingCurriculumRepository.getNodeById({
      db,
      nodeId,
    }),
  getCapstoneByNodeId: (simulationNodeId: string, sessionId: string) =>
    becomingCapstoneRepository.getCapstoneByNodeId({
      db,
      simulationNodeId,
      sessionId,
    }),
  listCapstoneMessages: (capstoneId: string) =>
    becomingCapstoneRepository.listMessages({
      db,
      capstoneId,
    }),
  appendCapstoneMessage: (payload: {
    capstoneId: string;
    role: Parameters<typeof becomingCapstoneRepository.appendMessage>[0]["role"];
    content: string;
    sequence: number;
    round: number;
  }) =>
    becomingCapstoneRepository.appendMessage({
      db,
      ...payload,
    }),
  updateCapstone: (payload: {
    capstoneId: string;
    status?: Parameters<typeof becomingCapstoneRepository.updateCapstone>[0]["status"];
    currentRound?: number;
    score?: number | null;
    feedback?: string | null;
  }) =>
    becomingCapstoneRepository.updateCapstone({
      db,
      ...payload,
    }),
  completeNode: (nodeId: string) =>
    becomingCurriculumRepository.completeNode({
      db,
      nodeId,
    }),
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
    message.includes("unlock")
  ) {
    return "BAD_REQUEST" as const;
  }

  if (message.includes("OPENAI_API_KEY") || message.includes("Failed to generate")) {
    return "BAD_REQUEST" as const;
  }

  return "INTERNAL_SERVER_ERROR" as const;
};

const throwOnFailure = <T>(result: { success: boolean; data?: T; error?: string }) => {
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
  const session = await becomingOnboardingRepository.getSession({
    db: ctx.db,
    sessionId,
  });

  if (!session) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Onboarding session does not exist.",
    });
  }

  if (!ctx.session?.user?.id || session.userId !== ctx.session.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this learning project.",
    });
  }

  return session;
};

export const becomingRouter = {
  startOnboarding: protectedProcedure.mutation(async ({ ctx }) =>
    throwOnFailure(
      await startOnboardingWorkflow({
        userId: ctx.session?.user.id,
        deps: {
          createSession: (userId) =>
            becomingOnboardingRepository.createSession({ db: ctx.db, userId }),
          appendMessage: (input) =>
            becomingOnboardingRepository.appendMessage({
              db: ctx.db,
              ...input,
            }),
        },
      }),
    )),

  onboardingState: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      const state = await becomingOnboardingRepository.getOnboardingState({
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

  listLearningProjects: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await becomingOnboardingRepository.listSessionsByUser({
      db: ctx.db,
      userId: ctx.session.user.id,
    });
    const sessionIds = sessions.map((session) => session.id);
    const [profiles, plans] = await Promise.all([
      becomingOnboardingRepository.listProfilesBySessionIds({
        db: ctx.db,
        sessionIds,
      }),
      becomingCurriculumRepository.listPlansBySessionIds({
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

    const projectNodesBySessionId = new Map<string, Awaited<ReturnType<typeof becomingCurriculumRepository.getPlanNodesBySession>>>();
    await Promise.all(
      plans.map(async (plan) => {
        const nodes = await becomingCurriculumRepository.getPlanNodesBySession({
          db: ctx.db,
          sessionId: plan.onboardingSessionId,
        });
        projectNodesBySessionId.set(plan.onboardingSessionId, nodes);
      }),
    );

    return sessions.map((session) => {
      const profile = profileBySessionId.get(session.id) ?? null;
      const plan = planBySessionId.get(session.id) ?? null;
      const planNodes = projectNodesBySessionId.get(session.id) ?? null;
      const lessonPreview = (planNodes ?? [])
        ?.filter(
          (node) => node.kind === "unit" || node.kind === "integration",
        )
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .slice(0, 3)
        .map((node) => ({
          id: node.id,
          title: node.title,
          status: node.status,
        })) ?? [];

      return {
        sessionId: session.id,
        title:
          profile?.targetIdentity ??
          plan?.targetIdentity ??
          "New learning track",
        headline: profile?.headline ?? plan?.summary ?? "Interview in progress.",
        status: plan
          ? "active"
          : session.status === "ready_for_generation" || session.status === "complete"
            ? "building"
            : "onboarding",
        lessonPreview,
        updatedAt: session.updatedAt ?? session.createdAt,
      };
    });
  }),

  submitOnboardingAnswer: protectedProcedure
    .input(SubmitOnboardingAnswerSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await submitOnboardingAnswerWorkflow({
          sessionId: input.sessionId,
          answer: input.answer,
          deps: {
            getSession: (sessionId) =>
              becomingOnboardingRepository.getSession({ db: ctx.db, sessionId }),
            appendMessage: (payload) =>
              becomingOnboardingRepository.appendMessage({
                db: ctx.db,
                ...payload,
              }),
            updateSession: (payload) =>
              becomingOnboardingRepository.updateSession({
                db: ctx.db,
                ...payload,
              }),
            listMessages: (sessionId) =>
              becomingOnboardingRepository.listMessages({
                db: ctx.db,
                sessionId,
              }),
          },
        }),
      );
    }),

  generateCurriculum: protectedProcedure
    .input(SessionIdSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await generateCurriculumWorkflow({
          sessionId: input.sessionId,
          deps: {
            getSession: (sessionId) =>
              becomingOnboardingRepository.getSession({ db: ctx.db, sessionId }),
            listMessages: (sessionId) =>
              becomingOnboardingRepository.listMessages({
                db: ctx.db,
                sessionId,
              }),
            createProfileVersion: (payload) =>
              becomingOnboardingRepository.createProfileVersion({
                db: ctx.db,
                ...payload,
              }),
            createPlan: (payload) =>
              becomingCurriculumRepository.createPlan({
                db: ctx.db,
                ...payload,
              }),
            getActivePlan: (sessionId) =>
              becomingCurriculumRepository.getActivePlan({
                db: ctx.db,
                sessionId,
              }),
            updateSession: (payload) =>
              becomingOnboardingRepository.updateSession({
                db: ctx.db,
                ...payload,
              }),
          },
        }),
      );
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
              becomingCurriculumRepository.getActivePlan({
                db: ctx.db,
                sessionId,
              }),
          },
        }),
      );
    }),

  aiWorkspace: protectedProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await getAiWorkspaceWorkflow({
          sessionId: input.sessionId,
          deps: {
            getActivePlan: (sessionId) =>
              becomingCurriculumRepository.getActivePlan({
                db: ctx.db,
                sessionId,
              }),
            listMessages: (sessionId, slot) =>
              becomingOnboardingRepository.listWorkspaceMessages({
                db: ctx.db,
                sessionId,
                slot,
              }),
            listPhaseResponsesBySession: (sessionId) =>
              becomingCurriculumRepository.listPhaseResponsesBySession({
                db: ctx.db,
                sessionId,
              }),
            getPhaseResponses: (unitContentId, sessionId) =>
              becomingCurriculumRepository.getPhaseResponses({
                db: ctx.db,
                unitContentId,
                sessionId,
              }),
            getUnitByNodeId: (nodeId) =>
              becomingCurriculumRepository.getUnitByNodeId({
                db: ctx.db,
                nodeId,
              }),
            createUnitContent: (payload) =>
              becomingCurriculumRepository.createUnitContent({
                db: ctx.db,
                ...payload,
              }),
          },
        }),
      );
    }),

  submitAiWorkspaceMessage: protectedProcedure
    .input(SubmitAiWorkspaceMessageSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSessionOwner({ ctx, sessionId: input.sessionId });

      return throwOnFailure(
        await submitAiWorkspaceMessageWorkflow({
          sessionId: input.sessionId,
          userId: ctx.session.user.id,
          message: input.message,
          deps: {
            getActivePlan: (sessionId) =>
              becomingCurriculumRepository.getActivePlan({
                db: ctx.db,
                sessionId,
              }),
            listMessages: (sessionId, slot) =>
              becomingOnboardingRepository.listWorkspaceMessages({
                db: ctx.db,
                sessionId,
                slot,
              }),
            appendMessage: (payload) =>
              becomingOnboardingRepository.appendWorkspaceMessage({
                db: ctx.db,
                ...payload,
              }),
            listPhaseResponsesBySession: (sessionId) =>
              becomingCurriculumRepository.listPhaseResponsesBySession({
                db: ctx.db,
                sessionId,
              }),
            getPhaseResponses: (unitContentId, sessionId) =>
              becomingCurriculumRepository.getPhaseResponses({
                db: ctx.db,
                unitContentId,
                sessionId,
              }),
            getUnitByNodeId: (nodeId) =>
              becomingCurriculumRepository.getUnitByNodeId({
                db: ctx.db,
                nodeId,
              }),
            createUnitContent: (payload) =>
              becomingCurriculumRepository.createUnitContent({
                db: ctx.db,
                ...payload,
              }),
            savePhaseResponse: (payload) =>
              becomingCurriculumRepository.savePhaseResponse({
                db: ctx.db,
                ...payload,
              }),
            completeNode: (nodeId) =>
              becomingCurriculumRepository.completeNode({
                db: ctx.db,
                nodeId,
              }),
            listMemories: async (userId) => {
              const result = await memoryRepository.listByUserId({
                db: ctx.db,
                userId,
              });

              return result.success ? result.data : [];
            },
            touchSession: (sessionId) =>
              becomingOnboardingRepository.touchSession({
                db: ctx.db,
                sessionId,
              }),
          },
        }),
      );
    }),

  unit: protectedProcedure.input(NodeSessionSchema).query(async ({ ctx, input }) => {
    await requireSessionOwner({ ctx, sessionId: input.sessionId });

    return throwOnFailure(
      await getUnitWorkflow({
        nodeId: input.nodeId,
        sessionId: input.sessionId,
        deps: {
          getUnitByNodeId: (nodeId) =>
            becomingCurriculumRepository.getUnitByNodeId({
              db: ctx.db,
              nodeId,
            }),
          getPhaseResponses: (unitContentId, sessionId) =>
            becomingCurriculumRepository.getPhaseResponses({
              db: ctx.db,
              unitContentId,
              sessionId,
            }),
          getNodeById: (nodeId) =>
            becomingCurriculumRepository.getNodeById({
              db: ctx.db,
              nodeId,
            }),
          getPlanNodesBySession: (sessionId) =>
            becomingCurriculumRepository.getPlanNodesBySession({
              db: ctx.db,
              sessionId,
            }),
          getTargetIdentity: async (sessionId) => {
            const profile = await becomingOnboardingRepository.getProfileBySession({
              db: ctx.db,
              sessionId,
            });

            return profile?.version.targetIdentity ?? null;
          },
          listAttemptHistory: (sessionId) =>
            becomingTrainingRepository.listAttemptHistory({
              db: ctx.db,
              sessionId,
            }),
          createUnitContent: (payload) =>
            becomingCurriculumRepository.createUnitContent({
              db: ctx.db,
              ...payload,
            }),
          saveNodeBriefing: (payload) =>
            becomingCurriculumRepository.saveNodeBriefing({
              db: ctx.db,
              ...payload,
            }),
        },
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
            userId: ctx.session?.user.id,
            deps: createCapstoneGenerationDeps(db),
          }),
        );
      })),

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
            userId: ctx.session?.user.id,
            deps: createCapstoneGenerationDeps(db),
          }),
        );
      })),

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

        await becomingOnboardingRepository.touchSession({
          db,
          sessionId: input.sessionId,
        });

        return result;
      })),

  home: protectedProcedure.input(SessionIdSchema).query(async ({ ctx, input }) => {
    await requireSessionOwner({ ctx, sessionId: input.sessionId });

    return throwOnFailure(
      await getHomeStateWorkflow({
        sessionId: input.sessionId,
        deps: {
          getHomeState: async (sessionId) => {
            const [profile, plan, summary, activeRecallGate, attemptHistory, nodeScores] =
              await Promise.all([
                becomingOnboardingRepository.getProfileBySession({
                  db: ctx.db,
                  sessionId,
                }),
                becomingCurriculumRepository.getActivePlan({
                  db: ctx.db,
                  sessionId,
                }),
                becomingTrainingRepository.getHomeSummary({
                  db: ctx.db,
                  sessionId,
                }),
                becomingRecallRepository.getActiveGateSummaryBySession({
                  db: ctx.db,
                  sessionId,
                }),
                becomingTrainingRepository.listAttemptHistory({
                  db: ctx.db,
                  sessionId,
                }),
                becomingTrainingRepository.listNodeScoresBySession({
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

  profile: protectedProcedure.input(SessionIdSchema).query(async ({ ctx, input }) => {
    await requireSessionOwner({ ctx, sessionId: input.sessionId });

    return throwOnFailure(
      await getProfileWorkflow({
        sessionId: input.sessionId,
        deps: {
          getProfileState: async (sessionId) => {
            const profile = await becomingOnboardingRepository.getProfileBySession({
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
