import { z } from "zod/v4";

import type { OnboardingTranscriptMessageSchema } from "@acme/validators";
import {
  IdentityReportSchema,
  ProjectOverviewSchema,
  ScenarioArchetypeSchema,
} from "@acme/validators";

/**
 * The distilled steering signal for a project build: what the learner wants to
 * learn, what they want to make, and what turns them alive.
 *
 * The consultant emits this directly in its `createProject` call — it just ran
 * the interview, so it is better positioned to name these than any agent
 * re-reading the transcript cold. Downstream agents receive the brief *plus*
 * the full transcript, so the brief steers and the transcript grounds.
 */
export const LearnerBriefSchema = z.object({
  whatToLearn: z
    .string()
    .min(1)
    .describe(
      "The field or craft the learner wants to learn, in their own words, including the specific flavor of it they care about. Not just a topic label.",
    ),
  whatToMake: z
    .string()
    .min(1)
    .describe(
      "The concrete thing the learner wants to build or be able to do, in their own words.",
    ),
  interests: z
    .array(z.string().min(1))
    .max(6)
    .describe(
      "What turns the learner alive. Each entry is self-contained: a named company, product, project, creator, or system plus the specific quality that holds their attention, or an excavated driver they confirmed in the interview.",
    ),
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
        masteryContract: MasteryContractSchema,
        scenarioArchetype: ScenarioArchetypeSchema.describe(
          "The ONE Solve response mode for every unit under this ability: select (MCQ under distractors — pick when the target credential is itself selected-response, e.g. SAT/AP/cert MC sections), transform (produce the path/artifact from state A to state B — pick for building/making crafts), judge (evaluate given artifacts and justify from mechanism — pick when the craft's core act is review, diagnosis, or choosing between defensible options).",
        ),
        scenarioArchetypeWhy: z
          .string()
          .min(1)
          .max(300)
          .describe(
            "One sentence: why this response mode matches how the ability is actually exercised in the learner's target credential or craft.",
          ),
        /** Dependency-ordered component skills (foundation-unit targets). */
        skills: z.array(AbilitySkillDraftSchema).min(3).max(8),
      }),
    )
    .min(2)
    .max(6),
});

const KnowledgeItemSchema = z.object({
  kind: z.enum(["concept", "mechanism"]),
  label: z.string().min(1),
  content: z.string().min(1),
});

/** One skill's authored questions and the knowledge needed to answer them. */
export const KnowledgeMapOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .min(1)
          .refine((value) => value.trim().endsWith("?"), {
            message: "knowledge questions must end with a question mark",
          }),
        items: z.array(KnowledgeItemSchema).min(1).max(6),
      }),
    )
    .min(1)
    .max(12),
});

export const CurriculumDesignerOutputSchema = z.object({
  identityReport: IdentityReportSchema,
  planDraft: CurriculumPlanDraftSchema,
});

// scenarioArchetype is required by CurriculumPlanDraftSchema itself, so new
// plans need no extra refinement beyond the base contract.
export const NewCurriculumDesignerOutputSchema = CurriculumDesignerOutputSchema;

export const ProjectOverviewOutputSchema = ProjectOverviewSchema.omit({
  generatedAt: true,
});

export type LearnerBrief = z.infer<typeof LearnerBriefSchema>;
export type CurriculumDesignerOutput = z.infer<
  typeof CurriculumDesignerOutputSchema
>;
export type ProjectOverviewOutput = z.infer<typeof ProjectOverviewOutputSchema>;
export type KnowledgeMapOutput = z.infer<typeof KnowledgeMapOutputSchema>;
export type OnboardingTranscript = z.infer<
  typeof OnboardingTranscriptMessageSchema
>[];
