import { z } from "zod/v4";

import type {
  OnboardingTranscriptMessageSchema,
  PostSeedUnitContentDraftSchema,
  PracticePromptSchema,
  PreSeedUnitContentDraftSchema,
  TeachbackMessageSchema} from "@acme/validators";
import {
  BeforeAfterProfileSchema,
  FailureGapSchema,
  GhostScenarioSchema,
  IdentityReportSchema,
  OnboardingQuestionSchema,
  ProjectOverviewSchema
} from "@acme/validators";

export const OnboardingPacketSchema = z.object({
  targetIdentity: z.string().min(1),
  motivation: z.string().min(1),
  currentBaseline: z.string().min(1),
  hardMoments: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)),
  proofOfProgress: z.string().min(1),
  identityFriction: z.string().min(1),
  behaviorSignals: z.array(z.string().min(1)).min(3),
  confidenceFlags: z.array(z.string().min(1)),
});

export const OnboardingDecisionSchema = z.object({
  decision: z.enum(["ask", "complete"]),
  question: OnboardingQuestionSchema.pick({
    slot: true,
    prompt: true,
    helper: true,
  }).nullable(),
});

export const CurriculumPlanDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  targetIdentity: z.string().min(1),
  clusters: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
        units: z
          .array(
            z.object({
              title: z.string().min(1),
              learningGoal: z.string().min(1),
            }),
          )
          .min(1)
          .max(6),
        simulation: z.object({
          title: z.string().min(1),
          summary: z.string().min(1),
          whyItMatters: z.string().min(1),
        }),
      }),
    )
    .min(1)
    .max(7),
  integrationLayers: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
        units: z
          .array(
            z.object({
              title: z.string().min(1),
              learningGoal: z.string().min(1),
            }),
          )
          .min(1)
          .max(4),
        clusterSynthesis: z.array(z.string().min(1)).min(2),
      }),
    )
    .max(6),
});

export const CurriculumDesignerOutputSchema = z.object({
  identityReport: IdentityReportSchema,
  beforeAfter: BeforeAfterProfileSchema,
  planDraft: CurriculumPlanDraftSchema,
});

export const ProjectOverviewOutputSchema = ProjectOverviewSchema.omit({
  generatedAt: true,
});

export const BuildContentAgentInputSchema = z.object({
  mode: z.enum(["pre_seed", "post_seed"]),
  node: z.object({
    id: z.string().min(1),
    kind: z.enum(["unit", "integration"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    whyItMatters: z.string().min(1),
    orderIndex: z.number().int().min(0),
  }),
  planContext: z.object({
    slotIndex: z.number().int().min(1),
    totalSlots: z.number().int().min(1),
    clusterContext: z
      .object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
      })
      .nullable(),
    integrationContext: z
      .object({
        completedClusterTitles: z.array(z.string().min(1)),
      })
      .nullable(),
  }),
  learner: z.object({
    targetIdentity: z.string().min(1),
    priorLearning: z.array(
      z.object({
        title: z.string().min(1),
        score: z.number().int().min(0).max(100),
        readiness: z.string().min(1),
        finalArticulation: z.string().nullable(),
        growthDimensions: z.array(z.string().min(1)).nullable(),
        improvements: z.array(z.string().min(1)),
        failureTags: z.array(z.string().min(1)),
        nextStep: z.string().min(1),
      }),
    ),
    seedResponse: z.string().min(1).optional(),
  }),
});

export const RepairTargetSchema = z.object({
  skill: z.string().min(1),
  transferObjective: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(2).max(5),
});

export const FailureIsolationReviewSchema = z.object({
  verdict: z.object({
    passed: z.boolean(),
    score: z.number().int().min(0).max(100),
    feedback: z.string().min(1),
  }),
  gap: FailureGapSchema.nullable(),
  evidenceAnchors: z.array(z.string().min(1)).min(1),
  repairTarget: RepairTargetSchema.nullable(),
});

export const GhostReplayScenarioEnvelopeSchema = z.object({
  ghostScenario: GhostScenarioSchema,
  transferFocus: z.array(z.string().min(1)).min(2).max(4),
});

export const GhostReplayEvaluationSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().min(1),
  transferEvidence: z.array(z.string().min(1)).min(1),
});

export type OnboardingPacket = z.infer<typeof OnboardingPacketSchema>;
export type OnboardingDecision = z.infer<typeof OnboardingDecisionSchema>;
export type CurriculumPlanDraft = z.infer<typeof CurriculumPlanDraftSchema>;
export type CurriculumDesignerOutput = z.infer<
  typeof CurriculumDesignerOutputSchema
>;
export type ProjectOverviewOutput = z.infer<typeof ProjectOverviewOutputSchema>;
export type BuildContentAgentInput = z.infer<typeof BuildContentAgentInputSchema>;
export type BuildContentPreSeedOutput = z.infer<
  typeof PreSeedUnitContentDraftSchema
>;
export type BuildContentPostSeedOutput = z.infer<
  typeof PostSeedUnitContentDraftSchema
>;
export type FailureIsolationReview = z.infer<
  typeof FailureIsolationReviewSchema
>;
export type RepairTarget = z.infer<typeof RepairTargetSchema>;
export type GhostReplayScenarioEnvelope = z.infer<
  typeof GhostReplayScenarioEnvelopeSchema
>;
export type GhostReplayEvaluation = z.infer<
  typeof GhostReplayEvaluationSchema
>;
export type OnboardingTranscript = z.infer<
  typeof OnboardingTranscriptMessageSchema
>[];
export type TeachbackTranscript = z.infer<typeof TeachbackMessageSchema>[];
export type PracticePrompt = z.infer<typeof PracticePromptSchema>;
