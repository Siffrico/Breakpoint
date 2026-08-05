// outcome-curriculum/contracts.ts
//
// The shape of a topic-mode curriculum. One topic becomes one-to-ten OUTCOME
// nodes, each naming a single main outcome that every task beneath it is
// judged against, and each carrying the three things a scenario generator
// needs to produce good tasks forever:
//
//   workflow      — how a good ANSWER is produced (the grading side)
//   scenarioBrief — how a good TASK is built (the generation side)
//   syllabus      — what legitimately varies between tasks (generated
//                   separately, per outcome; see syllabus-mapper.ts)
//
// Deliberately a separate contract from agents/contracts.ts: the two modes
// share no draft shape, and folding them together would mean a union that
// every consumer has to narrow.

import { z } from "zod/v4";

import {
  IdentityReportSchema,
  OutcomeOrderingSchema,
  ScenarioArchetypeSchema,
  ScenarioBriefSchema,
} from "@acme/validators";

/** Fewer than this and the topic was not really split; more and the learner
 *  is looking at a queue they will never finish. */
export const MIN_OUTCOMES_PER_PLAN = 1;
export const MAX_OUTCOMES_PER_PLAN = 10;

/**
 * The solve procedure for ONE task under this outcome — not a practitioner's
 * multi-stage workflow. For an SAT vocabulary-in-context item that is: read
 * for the constraint the context imposes, predict a word that satisfies it,
 * test each option against that constraint, eliminate the near-miss.
 *
 * Same field shape as the ability mode's workflow so `StoredSkillMap`, the
 * progression model, and the unit builder consume it unchanged — only the
 * meaning and the prompt that produces it differ.
 */
const SolveProcedureSchema = z.object({
  name: z.string().min(1),
  steps: z.array(z.string().min(1)).min(3).max(7),
});

const OutcomeMasteryContractSchema = z.object({
  exitCriteria: z.array(z.string().min(1)).min(1).max(5),
  maxRatingDeviation: z.number().int().min(30).max(200).optional(),
});

export const OutcomeDraftSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "What a practitioner would call this piece of the topic, in their own working words.",
    ),
  mainOutcome: z
    .string()
    .min(1)
    .describe(
      "The ONE thing every task under this outcome demands, stated so a third party could score an attempt from the produced work alone. May be binary ('the single defensible answer, justified from the stimulus') or a vector ('working code: high reliability, low latency, under real load').",
    ),
  summary: z.string().min(1),
  whyItMatters: z
    .string()
    .min(1)
    .describe(
      "Why reaching this outcome is load-bearing for what the learner said they want.",
    ),
  workflow: SolveProcedureSchema.describe(
    "The solve procedure for one task: what the performer notices, the judgment they make, the action that follows. This is what a grader checks reasoning against.",
  ),
  scenarioArchetype: ScenarioArchetypeSchema,
  scenarioArchetypeWhy: z.string().min(1).max(300),
  scenarioBrief: ScenarioBriefSchema,
  masteryContract: OutcomeMasteryContractSchema,
});

export const OutcomePlanDraftSchema = z.object({
  title: z.string().min(1),
  summary: z
    .string()
    .min(1)
    .describe("One line the learner reads to recognise their own project."),
  ordering: OutcomeOrderingSchema,
  orderingWhy: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "One sentence justifying the ordering against the test: can the learner tell which outcome a task belongs to from the task alone?",
    ),
  outcomes: z
    .array(OutcomeDraftSchema)
    .min(MIN_OUTCOMES_PER_PLAN)
    .max(MAX_OUTCOMES_PER_PLAN),
});

export const OutcomeCurriculumOutputSchema = z.object({
  identityReport: IdentityReportSchema,
  planDraft: OutcomePlanDraftSchema,
});

/**
 * One outcome's syllabus: what creates legitimate variation between its tasks.
 *
 * Reuses the question/items shape of the ability mode's knowledge map so the
 * whole persistence, coverage, and recall layer works untouched — but the
 * semantics differ. Here a QUESTION is a variation axis ("How do you handle a
 * word whose common meaning and contextual meaning conflict?") and its ITEMS
 * are the concepts and mechanisms that produce that variation.
 */
export const SyllabusOutputSchema = z.object({
  axes: z
    .array(
      z.object({
        axis: z
          .string()
          .min(1)
          .refine((value) => value.trim().endsWith("?"), {
            message: "syllabus axes must be phrased as a question",
          }),
        items: z
          .array(
            z.object({
              kind: z.enum(["concept", "mechanism"]),
              label: z.string().min(1),
              content: z.string().min(1),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(3)
    .max(10),
});

export type OutcomeDraft = z.infer<typeof OutcomeDraftSchema>;
export type OutcomePlanDraft = z.infer<typeof OutcomePlanDraftSchema>;
export type OutcomeCurriculumOutput = z.infer<
  typeof OutcomeCurriculumOutputSchema
>;
export type SyllabusOutput = z.infer<typeof SyllabusOutputSchema>;
