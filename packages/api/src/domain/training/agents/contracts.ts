import { z } from "zod/v4";

import type { OnboardingTranscriptMessageSchema } from "@acme/validators";
import {
  BeforeAfterProfileSchema,
  IdentityReportSchema,
  ProjectOverviewSchema,
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

/**
 * A cluster's difficulty span. The designer emits only the start and peak
 * top-band ceilings; the per-unit 3-band ladders are derived deterministically
 * in code (`expandUnitBands`), so the LLM never hand-types — and never
 * mis-ramps — the dozens of band numbers a cluster would otherwise require.
 */
const BandRampSchema = z
  .object({
    startRating: z.number().int(),
    peakRating: z.number().int(),
  })
  .refine((ramp) => ramp.peakRating > ramp.startRating, {
    message: "band ramp peakRating must be greater than startRating",
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
        workflow: z.object({
          name: z.string().min(1),
          steps: z.array(z.string().min(1)).min(3).max(7),
        }),
        bandRamp: BandRampSchema,
        simulation: z.object({
          title: z.string().min(1),
          summary: z.string().min(1),
          whyItMatters: z.string().min(1),
        }),
        masteryContract: z.object({
          exitCriteria: z.array(z.string().min(1)).min(1),
          maxRatingDeviation: z.number().int().min(30).max(200).optional(),
        }),
      }),
    )
    .min(3)
    .max(6),
});

export const SyllabusOutputSchema = z.object({
  entries: z
    .array(
      z.object({
        label: z.string().min(1),
        kind: z.enum(["discrimination", "concept", "subskill", "vocabulary"]),
        gloss: z.string().min(1),
      }),
    )
    .min(20)
    .max(60),
});

export const CurriculumDesignerOutputSchema = z.object({
  identityReport: IdentityReportSchema,
  beforeAfter: BeforeAfterProfileSchema,
  planDraft: CurriculumPlanDraftSchema,
});

export const ProjectOverviewOutputSchema = ProjectOverviewSchema.omit({
  generatedAt: true,
});

export type OnboardingPacket = z.infer<typeof OnboardingPacketSchema>;
export type CurriculumDesignerOutput = z.infer<
  typeof CurriculumDesignerOutputSchema
>;
export type ProjectOverviewOutput = z.infer<typeof ProjectOverviewOutputSchema>;
export type SyllabusOutput = z.infer<typeof SyllabusOutputSchema>;
export type OnboardingTranscript = z.infer<
  typeof OnboardingTranscriptMessageSchema
>[];
