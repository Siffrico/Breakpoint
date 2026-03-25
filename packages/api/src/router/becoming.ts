import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import type { CurriculumNode } from "@acme/validators";
import {
  CapstoneSubmissionSchema,
  GhostSubmissionSchema,
  PracticeSubmissionSchema,
  SeedResponseSchema,
  TeachbackSubmissionSchema,
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
  getTeachbackPromptWorkflow,
} from "../domain/becoming/workflows/get-teachback-prompt-workflow";
import {
  getUnitWorkflow,
} from "../domain/becoming/workflows/get-unit-workflow";
import {
  getFailureIsolationWorkflow,
} from "../domain/becoming/workflows/get-failure-isolation-workflow";
import {
  getForgeDebriefWorkflow,
} from "../domain/becoming/workflows/get-forge-debrief-workflow";
import {
  startOnboardingWorkflow,
} from "../domain/becoming/workflows/start-onboarding-workflow";
import {
  submitPracticeWorkflow,
} from "../domain/becoming/workflows/submit-practice-workflow";
import {
  submitGhostResponseWorkflow,
} from "../domain/becoming/workflows/submit-ghost-response-workflow";
import {
  submitCapstoneMessageWorkflow,
} from "../domain/becoming/workflows/submit-capstone-message-workflow";
import {
  submitOnboardingAnswerWorkflow,
} from "../domain/becoming/workflows/submit-onboarding-answer-workflow";
import {
  submitSeedWorkflow,
} from "../domain/becoming/workflows/submit-seed-workflow";
import {
  submitTeachbackWorkflow,
} from "../domain/becoming/workflows/submit-teachback-workflow";
import { becomingCapstoneRepository } from "../repositories/becoming-capstone-repository";
import { becomingCurriculumRepository } from "../repositories/becoming-curriculum-repository";
import { becomingOnboardingRepository } from "../repositories/becoming-onboarding-repository";
import { becomingTrainingRepository } from "../repositories/becoming-training-repository";
import { publicProcedure } from "../trpc";

const SessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const SubmitOnboardingAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  answer: z.string().min(1).max(4_000),
});

const NodeSessionSchema = z.object({
  nodeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

const SubmitSeedSchema = NodeSessionSchema.extend(SeedResponseSchema.shape);
const SubmitPracticeSchema = PracticeSubmissionSchema.extend({
  sessionId: z.string().uuid(),
});
const SubmitTeachbackSchema = TeachbackSubmissionSchema.extend({
  sessionId: z.string().uuid(),
});
const SubmitGhostResponseSchema = GhostSubmissionSchema.extend({
  sessionId: z.string().uuid(),
});
const SubmitCapstoneMessageSchema = CapstoneSubmissionSchema.extend({
  sessionId: z.string().uuid(),
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

export const becomingRouter = {
  startOnboarding: publicProcedure.mutation(async ({ ctx }) =>
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

  submitOnboardingAnswer: publicProcedure
    .input(SubmitOnboardingAnswerSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
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
      )),

  generateCurriculum: publicProcedure
    .input(SessionIdSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
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
      )),

  activePlan: publicProcedure
    .input(SessionIdSchema)
    .query(async ({ ctx, input }) =>
      throwOnFailure(
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
      )),

  unit: publicProcedure.input(NodeSessionSchema).query(async ({ ctx, input }) =>
    throwOnFailure(
      await getUnitWorkflow({
        nodeId: input.nodeId,
        sessionId: input.sessionId,
        deps: {
          getUnitByNodeId: (nodeId) =>
            becomingCurriculumRepository.getUnitByNodeId({
              db: ctx.db,
              nodeId,
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
        },
      }),
    )),

  submitSeed: publicProcedure
    .input(SubmitSeedSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
        await submitSeedWorkflow({
          nodeId: input.nodeId,
          sessionId: input.sessionId,
          response: input.response,
          userId: ctx.session?.user.id,
          deps: {
            getUnitByNodeId: (nodeId) =>
              becomingCurriculumRepository.getUnitByNodeId({
                db: ctx.db,
                nodeId,
              }),
            getTargetIdentity: async (sessionId) => {
              const profile = await becomingOnboardingRepository.getProfileBySession({
                db: ctx.db,
                sessionId,
              });

              return profile?.version.targetIdentity ?? null;
            },
            savePhaseResponse: (payload) =>
              becomingCurriculumRepository.savePhaseResponse({
                db: ctx.db,
                ...payload,
              }),
            updateUnitContent: (payload) =>
              becomingCurriculumRepository.updateUnitContent({
                db: ctx.db,
                ...payload,
              }),
          },
        }),
      )),

  submitPractice: publicProcedure
    .input(SubmitPracticeSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
        await submitPracticeWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          response: input.response,
          sequence: input.sequence,
          userId: ctx.session?.user.id,
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
            savePhaseResponse: (payload) =>
              becomingCurriculumRepository.savePhaseResponse({
                db: ctx.db,
                ...payload,
              }),
          },
        }),
      )),

  getTeachbackPrompt: publicProcedure
    .input(NodeSessionSchema)
    .query(async ({ ctx, input }) =>
      throwOnFailure(
        await getTeachbackPromptWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
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
          },
        }),
      )),

  submitTeachback: publicProcedure
    .input(SubmitTeachbackSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
        await submitTeachbackWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          round: input.round,
          response: input.response,
          userId: ctx.session?.user.id,
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
            savePhaseResponse: (payload) =>
              becomingCurriculumRepository.savePhaseResponse({
                db: ctx.db,
                ...payload,
              }),
          },
        }),
      )),

  getFailureIsolation: publicProcedure
    .input(NodeSessionSchema)
    .query(async ({ ctx, input }) =>
      throwOnFailure(
        await getFailureIsolationWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          userId: ctx.session?.user.id,
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
            getLatestFailureIsolation: (unitContentId, sessionId) =>
              becomingCurriculumRepository.getLatestFailureIsolation({
                db: ctx.db,
                unitContentId,
                sessionId,
              }),
            savePhaseResponse: (payload) =>
              becomingCurriculumRepository.savePhaseResponse({
                db: ctx.db,
                ...payload,
              }),
          },
        }),
      )),

  submitGhostResponse: publicProcedure
    .input(SubmitGhostResponseSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
        await submitGhostResponseWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          response: input.response,
          userId: ctx.session?.user.id,
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
            getLatestFailureIsolation: (unitContentId, sessionId) =>
              becomingCurriculumRepository.getLatestFailureIsolation({
                db: ctx.db,
                unitContentId,
                sessionId,
              }),
            savePhaseResponse: (payload) =>
              becomingCurriculumRepository.savePhaseResponse({
                db: ctx.db,
                ...payload,
              }),
          },
        }),
      )),

  getForgeDebrief: publicProcedure
    .input(NodeSessionSchema)
    .query(async ({ ctx, input }) =>
      throwOnFailure(
        await getForgeDebriefWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          userId: ctx.session?.user.id,
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
            getTargetIdentity: async (sessionId) => {
              const profile = await becomingOnboardingRepository.getProfileBySession({
                db: ctx.db,
                sessionId,
              });

              return profile?.version.targetIdentity ?? null;
            },
            getLatestAttemptByUnit: (sessionId, unitId) =>
              becomingTrainingRepository.getLatestAttemptByUnit({
                db: ctx.db,
                sessionId,
                unitId,
              }),
            saveAttempt: (payload) =>
              becomingTrainingRepository.saveAttempt({
                db: ctx.db,
                ...payload,
              }),
            completeNode: (nodeId) =>
              becomingCurriculumRepository.completeNode({
                db: ctx.db,
                nodeId,
              }),
            getPlanNodesBySession: (sessionId) =>
              becomingCurriculumRepository.getPlanNodesBySession({
                db: ctx.db,
                sessionId,
              }),
            generateCapstone: async ({ nodeId, sessionId, userId }) => {
              const result = await generateCapstoneWorkflow({
                nodeId,
                sessionId,
                userId,
                deps: {
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
                  getCapstoneByNodeId: (simulationNodeId, sessionId) =>
                    becomingCapstoneRepository.getCapstoneByNodeId({
                      db: ctx.db,
                      simulationNodeId,
                      sessionId,
                    }),
                  listCapstoneMessages: (capstoneId) =>
                    becomingCapstoneRepository.listMessages({
                      db: ctx.db,
                      capstoneId,
                    }),
                  saveCapstone: (payload) =>
                    becomingCapstoneRepository.saveCapstone({
                      db: ctx.db,
                      ...payload,
                    }),
                  appendCapstoneMessage: (payload) =>
                    becomingCapstoneRepository.appendMessage({
                      db: ctx.db,
                      ...payload,
                    }),
                  getUnitByNodeId: (nodeId) =>
                    becomingCurriculumRepository.getUnitByNodeId({
                      db: ctx.db,
                      nodeId,
                    }),
                  listLatestAttemptsByUnitIds: (sessionId, unitIds) =>
                    becomingTrainingRepository.listLatestAttemptsByUnitIds({
                      db: ctx.db,
                      sessionId,
                      unitIds,
                    }),
                },
              });

              if (!result.success) {
                throw new Error(result.error);
              }
            },
          },
        }),
      )),

  getCapstone: publicProcedure
    .input(NodeSessionSchema)
    .query(async ({ ctx, input }) =>
      throwOnFailure(
        await getCapstoneWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          userId: ctx.session?.user.id,
          deps: {
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
            getCapstoneByNodeId: (simulationNodeId, sessionId) =>
              becomingCapstoneRepository.getCapstoneByNodeId({
                db: ctx.db,
                simulationNodeId,
                sessionId,
              }),
            listCapstoneMessages: (capstoneId) =>
              becomingCapstoneRepository.listMessages({
                db: ctx.db,
                capstoneId,
              }),
            saveCapstone: (payload) =>
              becomingCapstoneRepository.saveCapstone({
                db: ctx.db,
                ...payload,
              }),
            appendCapstoneMessage: (payload) =>
              becomingCapstoneRepository.appendMessage({
                db: ctx.db,
                ...payload,
              }),
            getUnitByNodeId: (nodeId) =>
              becomingCurriculumRepository.getUnitByNodeId({
                db: ctx.db,
                nodeId,
              }),
            listLatestAttemptsByUnitIds: (sessionId, unitIds) =>
              becomingTrainingRepository.listLatestAttemptsByUnitIds({
                db: ctx.db,
                sessionId,
                unitIds,
              }),
          },
        }),
      )),

  generateCapstone: publicProcedure
    .input(NodeSessionSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
        await generateCapstoneWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          userId: ctx.session?.user.id,
          deps: {
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
            getCapstoneByNodeId: (simulationNodeId, sessionId) =>
              becomingCapstoneRepository.getCapstoneByNodeId({
                db: ctx.db,
                simulationNodeId,
                sessionId,
              }),
            listCapstoneMessages: (capstoneId) =>
              becomingCapstoneRepository.listMessages({
                db: ctx.db,
                capstoneId,
              }),
            saveCapstone: (payload) =>
              becomingCapstoneRepository.saveCapstone({
                db: ctx.db,
                ...payload,
              }),
            appendCapstoneMessage: (payload) =>
              becomingCapstoneRepository.appendMessage({
                db: ctx.db,
                ...payload,
              }),
            getUnitByNodeId: (nodeId) =>
              becomingCurriculumRepository.getUnitByNodeId({
                db: ctx.db,
                nodeId,
              }),
            listLatestAttemptsByUnitIds: (sessionId, unitIds) =>
              becomingTrainingRepository.listLatestAttemptsByUnitIds({
                db: ctx.db,
                sessionId,
                unitIds,
              }),
          },
        }),
      )),

  submitCapstoneMessage: publicProcedure
    .input(SubmitCapstoneMessageSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
        await submitCapstoneMessageWorkflow({
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          response: input.response,
          deps: {
            getNodeById: (nodeId) =>
              becomingCurriculumRepository.getNodeById({
                db: ctx.db,
                nodeId,
              }),
            getCapstoneByNodeId: (simulationNodeId, sessionId) =>
              becomingCapstoneRepository.getCapstoneByNodeId({
                db: ctx.db,
                simulationNodeId,
                sessionId,
              }),
            listCapstoneMessages: (capstoneId) =>
              becomingCapstoneRepository.listMessages({
                db: ctx.db,
                capstoneId,
              }),
            appendCapstoneMessage: (payload) =>
              becomingCapstoneRepository.appendMessage({
                db: ctx.db,
                ...payload,
              }),
            updateCapstone: (payload) =>
              becomingCapstoneRepository.updateCapstone({
                db: ctx.db,
                ...payload,
              }),
            completeNode: (nodeId) =>
              becomingCurriculumRepository.completeNode({
                db: ctx.db,
                nodeId,
              }),
          },
        }),
      )),

  home: publicProcedure.input(SessionIdSchema).query(async ({ ctx, input }) =>
    throwOnFailure(
      await getHomeStateWorkflow({
        sessionId: input.sessionId,
        deps: {
          getHomeState: async (sessionId) => {
            const [profile, plan, summary] = await Promise.all([
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
              blockingSignals:
                summary.recentFailureTags.length > 0
                  ? summary.recentFailureTags
                  : profile.version.confidenceFlags.length > 0
                    ? profile.version.confidenceFlags
                    : profile.version.behaviorSignals.slice(0, 3),
            };
          },
        },
      }),
    )),

  profile: publicProcedure.input(SessionIdSchema).query(async ({ ctx, input }) =>
    throwOnFailure(
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
    )),
} satisfies TRPCRouterRecord;
