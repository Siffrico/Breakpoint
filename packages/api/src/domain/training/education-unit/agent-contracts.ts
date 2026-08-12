import { z } from "zod/v4";

import type { EvaluationDimensionResult } from "@acme/validators";
import {
  EvaluationDimensionResultSchema,
  ScenarioVerifierSchema,
} from "@acme/validators";

import { getReviewPresentationReadinessIssue } from "./unit-readiness";

export const LearnerFacingMessageSchema = z.string().trim().min(24).max(8_000);

export const mentorCheckOutputSchema = (currentCapabilityId: string) =>
  z
    .object({
      assistantMessage: LearnerFacingMessageSchema,
      completedCapabilityId: z.literal(currentCapabilityId).nullable(),
      scratchpad: z.string().trim().min(1).max(600),
    })
    .strict()
    .superRefine((output, ctx) => {
      const questionCount = output.assistantMessage.match(/\?/g)?.length ?? 0;
      if (
        output.completedCapabilityId === null &&
        (!output.assistantMessage.trimEnd().endsWith("?") ||
          questionCount !== 1)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message:
            "An incomplete comprehension check must end in exactly one visible learner question.",
        });
      }
      if (output.completedCapabilityId !== null && questionCount > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message:
            "A passing comprehension check must close without another question.",
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

const reviewOptionSchema = (label: "A" | "B" | "C" | "D") =>
  z
    .object({
      label: z.literal(label),
      text: z.string().trim().min(1).max(1_000),
    })
    .strict();

const reviewPresentationBase = {
  assistantMessage: LearnerFacingMessageSchema,
  verifier: ScenarioVerifierSchema,
};

interface ReviewOption {
  readonly label: "A" | "B" | "C" | "D";
  readonly text: string;
}

export const renderReviewPresentation = (output: {
  readonly assistantMessage: string;
  readonly options?: readonly ReviewOption[];
}): string =>
  [
    output.assistantMessage.trim(),
    output.options
      ?.map((option) => `${option.label}) ${option.text.trim()}`)
      .join("\n\n"),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

const refineReviewPresentation = (
  output: {
    readonly assistantMessage: string;
    readonly options?: readonly ReviewOption[];
    readonly verifier: z.infer<typeof ScenarioVerifierSchema>;
  },
  ctx: z.RefinementCtx,
) => {
  const assistantMessage = renderReviewPresentation(output);
  const readinessIssue = getReviewPresentationReadinessIssue({
    assistantMessage,
    verifier: output.verifier,
  });
  if (readinessIssue) {
    ctx.addIssue({
      code: "custom",
      path: ["assistantMessage"],
      message: readinessIssue,
    });
  }
  if (/<\/?scratchpad>|verifier\.|checkerSpec/i.test(assistantMessage)) {
    ctx.addIssue({
      code: "custom",
      path: ["assistantMessage"],
      message: "learner-facing text must not expose private authoring data",
    });
  }
};

const selectedReviewPresentationSchema = z
  .object({
    ...reviewPresentationBase,
    options: z.tuple([
      reviewOptionSchema("A"),
      reviewOptionSchema("B"),
      reviewOptionSchema("C"),
      reviewOptionSchema("D"),
    ]),
  })
  .strict()
  .superRefine(refineReviewPresentation);

const openReviewPresentationSchema = z
  .object(reviewPresentationBase)
  .strict()
  .superRefine(refineReviewPresentation);

export const reviewPresentationSchema = (selectedResponse: boolean) =>
  selectedResponse
    ? selectedReviewPresentationSchema
    : openReviewPresentationSchema;

const mentorOpeningBase = {
  assistantMessage: LearnerFacingMessageSchema,
  completedCapabilityId: z.null(),
  scratchpad: z.string().trim().min(1).max(600),
};

export const mentorOpeningOutputSchema = (selectedResponse: boolean) =>
  (selectedResponse
    ? z.object({
        ...mentorOpeningBase,
        preparedScenario: selectedReviewPresentationSchema,
      })
    : z.object({
        ...mentorOpeningBase,
        preparedScenario: openReviewPresentationSchema,
      })
  )
    .strict()
    .superRefine((output, ctx) => {
      const questionCount = output.assistantMessage.match(/\?/g)?.length ?? 0;
      const wordCount = output.assistantMessage.trim().split(/\s+/).length;
      if (wordCount < 100 || wordCount > 200) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message: "An opening teaching step must contain 100 to 200 words.",
        });
      }
      if (
        !output.assistantMessage.trimEnd().endsWith("?") ||
        questionCount !== 1
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message: "An opening teaching step must end in exactly one question.",
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
      if (gap && output.errorCodes.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["errorCodes"],
          message: "A learner gap requires at least one diagnostic error code.",
        });
      }
      if (!gap && output.errorCodes.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["errorCodes"],
          message: "A clean answer cannot carry diagnostic error codes.",
        });
      }
      if (gap && !output.dimensionResults.some((result) => result.missing)) {
        ctx.addIssue({
          code: "custom",
          path: ["dimensionResults"],
          message: "A learner gap requires a concrete missing element.",
        });
      }
      if (!gap && output.dimensionResults.some((result) => result.missing)) {
        ctx.addIssue({
          code: "custom",
          path: ["dimensionResults"],
          message: "A clean answer cannot report a missing element.",
        });
      }
      if (
        gap &&
        !["What held", "Change", "Use next time"].every((label) =>
          new RegExp(`\\*\\*${label}\\*\\*`, "i").test(output.assistantMessage),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message:
            "feedback for a learner gap must include What held, Change, and Use next time labels",
        });
      }
      if (
        !gap &&
        /\*\*(?:What held|Change|Use next time)\*\*|\b(?:one more|another|next|fresh) (?:challenge|scenario|problem)\b/i.test(
          output.assistantMessage,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assistantMessage"],
          message:
            "feedback for a clean answer must close concisely without repair sections or promising another task",
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

export type MentorCheckOutput = z.infer<
  ReturnType<typeof mentorCheckOutputSchema>
>;
export type MentorOpeningOutput = z.infer<
  ReturnType<typeof mentorOpeningOutputSchema>
>;
export type ReviewPresentationOutput = z.infer<
  ReturnType<typeof reviewPresentationSchema>
>;
export type ReviewGradeOutput = z.infer<ReturnType<typeof reviewGradeSchema>>;
