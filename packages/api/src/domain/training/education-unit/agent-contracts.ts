import { z } from "zod/v4";

import type { EvaluationDimensionResult } from "@acme/validators";
import {
  EvaluationDimensionResultSchema,
  ScenarioVerifierSchema,
} from "@acme/validators";
import { getReviewPresentationReadinessIssue } from "./unit-readiness";

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
        output.completedCapabilityId !== null &&
        !/^\s*\*\*Worked example\*\*\s*$/im.test(output.assistantMessage)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message:
            "A completed teaching turn must include a bold Worked example section.",
        });
      }
      if (
        output.completedCapabilityId !== null &&
        !/^\s*\*\*Pattern to reuse\*\*\s*$/im.test(output.assistantMessage)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message:
            "A completed teaching turn must include a bold Pattern to reuse section.",
        });
      }
      if (
        output.completedCapabilityId === null &&
        !output.assistantMessage.includes("?")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message:
            "An incomplete capability response must end in a visible learner question.",
        });
      }
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

export const reviewPresentationSchema = z
  .object({
    assistantMessage: LearnerFacingMessageSchema,
    verifier: ScenarioVerifierSchema,
  })
  .strict()
  .superRefine((output, ctx) => {
    const readinessIssue = getReviewPresentationReadinessIssue(output);
    if (readinessIssue) {
      ctx.addIssue({
        code: "custom",
        path: ["assistantMessage"],
        message: readinessIssue,
      });
    }
    if (
      /<\/?scratchpad>|verifier\.|checkerSpec/i.test(output.assistantMessage)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["assistantMessage"],
        message: "learner-facing text must not expose private authoring data",
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

export const PASSING_COMPOSITE = 80;
export const PASSING_DIMENSION = 70;

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

export interface GradeShape {
  /** Exactly the dimensions the active challenge's contract tests. */
  readonly testedDimensionIds: readonly string[];
  /** The learner's latest answer, which every evidence quote must come from. */
  readonly learnerAnswer: string;
  /** Whether this mark can end the unit, or only opens another pass. */
  readonly decisive: boolean;
}

/**
 * Grade plus critique. There is no verdict field: pass or fail is derived from
 * the scores the critic already committed to, so "did they get it" is never a
 * second, separately-fallible judgement call.
 */
export const reviewGradeSchema = ({
  testedDimensionIds,
  learnerAnswer,
}: GradeShape) =>
  z
    .object({
      assistantMessage: LearnerFacingMessageSchema,
      errorCodes: z.array(z.string().min(1)).max(3),
      scratchpad: z.string().trim().min(24).max(600),
      dimensionResults: z
        .array(
          EvaluationDimensionResultSchema.extend({
            dimensionId: z.enum(testedDimensionIds),
            score: z
              .number()
              .int()
              .min(0)
              .max(100)
              .describe(
                "A percentage score from 0 to 100, never a 1-3 ordinal.",
              ),
            evidence: evidenceSchema(learnerAnswer),
          }),
        )
        .length(testedDimensionIds.length),
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
      if (gap && !output.assistantMessage.trimEnd().endsWith("?")) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message:
            "feedback for a learner gap must end with one targeted application question",
        });
      }
      if (
        /\b(?:the mirror|the pivot|the crucible)\b/i.test(
          output.assistantMessage,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message: "write naturally without named diagnostic template sections",
        });
      }
    });

export type MentorOutput = z.infer<ReturnType<typeof mentorOutputSchema>>;
export type ReviewPresentationOutput = z.infer<typeof reviewPresentationSchema>;
export type ReviewGradeOutput = z.infer<ReturnType<typeof reviewGradeSchema>>;
