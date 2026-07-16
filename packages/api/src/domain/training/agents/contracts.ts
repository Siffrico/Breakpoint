import { z } from "zod/v4";

import type { OnboardingTranscriptMessageSchema } from "@acme/validators";
import {
  BeforeAfterProfileSchema,
  IdentityReportSchema,
  KnowledgeModelOutputSchema,
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
  scenarioInspirations: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .describe(
      "Named companies, products, projects, creators, or systems the learner finds compelling, each paired with the specific quality that interests them.",
    ),
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

const WorkflowSchema = z.object({
  name: z.string().min(1),
  steps: z.array(z.string().min(1)).min(3).max(7),
});

const MasteryContractSchema = z.object({
  exitCriteria: z.array(z.string().min(1)).min(1),
  maxRatingDeviation: z.number().int().min(30).max(200).optional(),
});

/**
 * One component skill of an ability, in dependency order. Each skill gets its
 * own foundation units and concept map; it carries no bandRamp — foundation
 * mastery is criterion-referenced (concept coverage), never rating-referenced.
 * The signal-moment framing: a skill is one recurring workflow moment where
 * expertise visibly changes the outcome.
 */
export const AbilitySkillDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  /** The workflow moment this skill owns: cue → reasoning → action. */
  workflow: WorkflowSchema,
  masteryContract: MasteryContractSchema.omit({ maxRatingDeviation: true }),
});

export const CurriculumPlanDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  targetIdentity: z.string().min(1),
  abilities: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
        /** The integrated whole-ability workflow skillset units run against. */
        workflow: WorkflowSchema,
        /** ELO tier climb for skillset units only. */
        bandRamp: BandRampSchema,
        masteryContract: MasteryContractSchema,
        /** Dependency-ordered component skills (foundation-unit targets). */
        skills: z.array(AbilitySkillDraftSchema).min(3).max(8),
      }),
    )
    .min(2)
    .max(6),
});

/**
 * The concept map for one skill: every entry is a causal claim ("X under Y
 * causes Z"), not a topic label. A mechanism-form concept is a scenario
 * template — the scenario agent instantiates it instead of inventing form.
 */
export const SyllabusOutputSchema = z.object({
  entries: z
    .array(
      z.object({
        label: z.string().min(1),
        kind: z.enum(["discrimination", "concept", "subskill", "vocabulary"]),
        gloss: z.string().min(1),
        /** The causal claim: what, under which conditions, causes what. */
        mechanism: z.string().min(1),
        topicSlug: z.string().min(1).max(120).nullable().optional(),
      }),
    )
    .min(6)
    .max(24),
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
export type KnowledgeModelOutput = z.infer<typeof KnowledgeModelOutputSchema>;
export { KnowledgeModelOutputSchema };
export type OnboardingTranscript = z.infer<
  typeof OnboardingTranscriptMessageSchema
>[];
