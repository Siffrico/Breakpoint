import { z } from "zod/v4";

import type { EvaluationDimensionResult, UnitRunKind } from "@acme/validators";
import {
  DifficultyVectorSchema,
  EvaluationDimensionResultSchema,
  ScenarioEvaluationContractSchema,
  ScenarioEvaluationDimensionSchema,
} from "@acme/validators";

export const LearnerFacingMessageSchema = z.string().trim().min(24).max(8_000);

/**
 * The mentor may only ever check off the capability it is currently working on,
 * so that id is baked into the schema as a literal. Naming a stale, unknown, or
 * out-of-order capability is unrepresentable rather than rejected after the
 * model has already streamed a reply to the learner.
 */
export const mentorOutputSchema = (currentCapabilityId: string) =>
  z
    .object({
      assistantMessage: LearnerFacingMessageSchema,
      completedCapabilityId: z.literal(currentCapabilityId).nullable(),
    })
    .strict()
    .superRefine((output, ctx) => {
      if (
        output.completedCapabilityId === null &&
        /\bmark (?:this|it|the (?:capability|unit|todo))(?: one)? complete\b/i.test(
          output.assistantMessage,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["completedCapabilityId"],
          message:
            "A completion claim requires completedCapabilityId to be set.",
        });
      }
    });

// ---------------------------------------------------------------------------
// Critic contracts
//
// Every reviewer rule that used to be an imperative post-check lives here as
// schema shape. A violation is then one cheap self-repair round inside the
// agent runner instead of a dead turn the learner has already watched stream.
// ---------------------------------------------------------------------------

const PASSING_COMPOSITE = 80;
const PASSING_DIMENSION = 70;

export const compositeScore = (
  results: readonly Pick<EvaluationDimensionResult, "score">[],
): number =>
  results.length === 0
    ? 0
    : Math.round(
        results.reduce((total, result) => total + result.score, 0) /
          results.length,
      );

/**
 * Whether the answer left a gap worth repairing. Derived from the dimension
 * scores the critic already committed to, so "should there be a targeted
 * exercise" is never a second, separately-fallible judgement call.
 */
export const hasModelGap = (
  results: readonly Pick<EvaluationDimensionResult, "score">[],
): boolean =>
  compositeScore(results) < PASSING_COMPOSITE ||
  results.some((result) => result.score < PASSING_DIMENSION);

/**
 * Folds the differences a model reliably introduces when re-typing a learner's
 * words — smart quotes, dashes, collapsed whitespace, an added trailing period.
 * Without this the verbatim-quote rule burns a repair round on nearly every
 * grade while the quote is, for every human purpose, exact.
 */
export const normalizeEvidence = (value: string): string =>
  value
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`.,;:!?()[\]-]+/, "")
    .replace(/[\s"'`.,;:!?()[\]-]+$/, "")
    .toLocaleLowerCase();

const MIN_EVIDENCE_CHARACTERS = 3;

const evidenceSchema = (learnerAnswer: string) => {
  const haystack = normalizeEvidence(learnerAnswer);
  return z
    .string()
    .min(1)
    .refine(
      (quote) => {
        const needle = normalizeEvidence(quote);
        return (
          needle.length >= MIN_EVIDENCE_CHARACTERS && haystack.includes(needle)
        );
      },
      {
        message:
          "evidence must be a verbatim quote from the learner's latest answer",
      },
    );
};

export interface ChallengeShape {
  /** The dimension ids a challenge is allowed to test. */
  readonly dimensionIds: readonly string[];
  /** Goldilocks' chosen format, when the run has a difficulty snapshot. */
  readonly formatId: string | null;
  readonly runKind: UnitRunKind;
}

/**
 * The private half of any challenge the critic authors. Goldilocks' format and
 * the run kind are literals and the dimension ids are an enum, so a challenge
 * that drifts off the calibrated format or invents a capability cannot be
 * produced in the first place.
 */
const challengeFields = ({
  dimensionIds,
  formatId,
  runKind,
}: ChallengeShape) => ({
  difficultyVector: formatId
    ? DifficultyVectorSchema.extend({ formatId: z.literal(formatId) })
    : DifficultyVectorSchema,
  contract: ScenarioEvaluationContractSchema.extend({
    runKind: z.literal(runKind),
    testedDimensions: z
      .array(
        ScenarioEvaluationDimensionSchema.extend({
          dimensionId: z.enum(dimensionIds),
        }),
      )
      .min(1)
      .max(dimensionIds.length),
  }),
});

export const reviewPresentationSchema = (shape: ChallengeShape) =>
  z
    .object({
      assistantMessage: LearnerFacingMessageSchema,
      ...challengeFields(shape),
    })
    .strict()
    .refine((output) => output.assistantMessage.includes("?"), {
      path: ["assistantMessage"],
      message: "A review challenge must visibly ask the learner a question.",
    });

export interface GradeShape {
  /** Exactly the dimensions the active challenge's contract tests. */
  readonly testedDimensionIds: readonly string[];
  /** The learner's latest answer, which every evidence quote must come from. */
  readonly learnerAnswer: string;
  readonly formatId: string | null;
  readonly runKind: UnitRunKind;
  /** Whether the active item is the pass's independent scenario. */
  readonly isMainScenario: boolean;
}

/**
 * Grade plus critique plus — when the answer left a gap — the one targeted
 * exercise that repairs it. There is no verdict field: whether a repair happens
 * is derived from the scores. A repair can itself expose a remaining gap, so
 * the same contract permits another targeted application.
 */
export const reviewGradeSchema = ({
  testedDimensionIds,
  learnerAnswer,
  formatId,
  runKind,
}: GradeShape) =>
  z
    .object({
      assistantMessage: LearnerFacingMessageSchema,
      errorCodes: z.array(z.string().min(1)).max(3),
      gradeReasoning: z.string().min(12),
      dimensionResults: z
        .array(
          EvaluationDimensionResultSchema.extend({
            dimensionId: z.enum(testedDimensionIds),
            evidence: evidenceSchema(learnerAnswer),
          }),
        )
        .length(testedDimensionIds.length),
      targetedExercise: z
        .object(
          challengeFields({
            dimensionIds: testedDimensionIds,
            formatId,
            runKind,
          }),
        )
        .strict()
        .nullable(),
    })
    .strict()
    .superRefine((output, ctx) => {
      const gradedIds = output.dimensionResults.map(
        (result) => result.dimensionId,
      );
      if (new Set(gradedIds).size !== gradedIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["dimensionResults"],
          message: "Grade each tested dimension exactly once.",
        });
      }
      const gap = hasModelGap(output.dimensionResults);
      if (gap && output.targetedExercise === null) {
        ctx.addIssue({
          code: "custom",
          path: ["targetedExercise"],
          message:
            "These scores show a gap, so this grade must carry one targeted exercise.",
        });
      }
      if (!gap && output.targetedExercise !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["targetedExercise"],
          message:
            "These scores show no gap, so this grade must not carry a targeted exercise.",
        });
      }
      if (gap && output.errorCodes.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["errorCodes"],
          message: "A grade with a gap requires at least one error code.",
        });
      }
      if (!gap && output.errorCodes.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["errorCodes"],
          message: "A grade with no gap cannot carry failure error codes.",
        });
      }
    });

export type MentorOutput = z.infer<ReturnType<typeof mentorOutputSchema>>;
export type ReviewPresentationOutput = z.infer<
  ReturnType<typeof reviewPresentationSchema>
>;
export type ReviewGradeOutput = z.infer<ReturnType<typeof reviewGradeSchema>>;
