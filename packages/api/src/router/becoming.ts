import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import type { CurriculumNode } from "@acme/validators";

import {
  getActivePlanWorkflow,
} from "../domain/becoming/workflows/get-active-plan-workflow";
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
  startOnboardingWorkflow,
} from "../domain/becoming/workflows/start-onboarding-workflow";
import {
  submitOnboardingAnswerWorkflow,
} from "../domain/becoming/workflows/submit-onboarding-answer-workflow";
import {
  submitRetrievalWorkflow,
} from "../domain/becoming/workflows/submit-retrieval-workflow";
import {
  submitUnitResponseWorkflow,
} from "../domain/becoming/workflows/submit-unit-response-workflow";
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

const UnitIdSchema = z.object({
  nodeId: z.string().uuid(),
});

const SubmitRetrievalSchema = z.object({
  nodeId: z.string().uuid(),
  answers: z.array(z.string().min(1).max(1_000)).length(3),
});

const SubmitUnitResponseSchema = z.object({
  sessionId: z.string().uuid(),
  nodeId: z.string().uuid(),
  response: z.string().min(1).max(8_000),
});

const getErrorCode = (message: string) => {
  if (message.includes("does not exist") || message.includes("not found")) {
    return "NOT_FOUND" as const;
  }

  if (message.includes("more specific") || message.includes("fuller")) {
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

  unit: publicProcedure.input(UnitIdSchema).query(async ({ ctx, input }) =>
    throwOnFailure(
      await getUnitWorkflow({
        nodeId: input.nodeId,
        deps: {
          getUnitByNodeId: (nodeId) =>
            becomingCurriculumRepository.getUnitByNodeId({
              db: ctx.db,
              nodeId,
            }),
        },
      }),
    )),

  submitRetrieval: publicProcedure
    .input(SubmitRetrievalSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
        await submitRetrievalWorkflow({
          nodeId: input.nodeId,
          answers: input.answers,
          deps: {
            getUnitByNodeId: (nodeId) =>
              becomingCurriculumRepository.getUnitByNodeId({
                db: ctx.db,
                nodeId,
              }),
          },
        }),
      )),

  submitUnitResponse: publicProcedure
    .input(SubmitUnitResponseSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnFailure(
        await submitUnitResponseWorkflow({
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
            getTargetIdentity: async (sessionId) => {
              const profile = await becomingOnboardingRepository.getProfileBySession({
                db: ctx.db,
                sessionId,
              });

              return profile?.version.targetIdentity ?? null;
            },
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
              (node: CurriculumNode) => node.kind === "unit",
            ).length;
            const completedUnits = plan.nodes.filter(
              (node: CurriculumNode) =>
                node.kind === "unit" && node.status === "completed",
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
              nextUnitTitle: nextNode?.title ?? null,
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
