import { z } from "zod/v4";

import type { EvaluationDimensionResult } from "@acme/validators";
import {
  EvaluationDimensionResultSchema,
  ScenarioVerifierSchema,
} from "@acme/validators";

import { getReviewPresentationReadinessIssue } from "./unit-readiness";

export const LearnerFacingMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_000)
  .describe(
    "The Markdown shown to the learner, formatted and laid out by you. It must read as finished and self-contained: no drafting notes, no private reasoning, no answer.",
  );

const reviewOptionSchema = z
  .object({
    label: z
      .enum(["A", "B", "C", "D"])
      .describe("The option label. Use each label exactly once."),
    text: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .describe(
        "One polished, idiomatic answer choice. It must read grammatically after the question stem and stay parallel in grammar and scope with the other choices. Do not use all-caps emphasis, add author notes, or explain whether it is correct.",
      ),
  })
  .strict();

const reviewPresentationBase = {
  assistantMessage: LearnerFacingMessageSchema,
  verifier: ScenarioVerifierSchema,
};

const selectedReviewVerifierSchema = z
  .object({
    type: z.literal("fixed_answer"),
    answer: z
      .enum(["A", "B", "C", "D"])
      .describe("The one correct option label."),
    checkerSpec: z.null(),
    scratchpad: z
      .string()
      .trim()
      .min(24)
      .max(600)
      .describe(
        "A concise private check, 24 to 600 characters, of the intended answer and why each distractor is wrong. Do not repeat the prompt. This is never shown to the learner.",
      ),
  })
  .strict();

interface ReviewOption {
  readonly label: "A" | "B" | "C" | "D";
  readonly text: string;
}

export const renderReviewPresentation = (output: {
  readonly stimulus?: string | null;
  readonly assistantMessage: string;
  readonly options?: readonly ReviewOption[];
}): string =>
  [
    output.stimulus?.trim(),
    output.assistantMessage.trim(),
    output.options
      ?.map((option) => `${option.label}) ${option.text.trim()}`)
      .join("\n\n"),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

const refineReviewPresentation = (
  output: {
    readonly stimulus?: string | null;
    readonly assistantMessage: string;
    readonly options?: readonly ReviewOption[];
    readonly verifier: z.infer<typeof ScenarioVerifierSchema>;
  },
  ctx: z.RefinementCtx,
) => {
  const assistantMessage = renderReviewPresentation(output);
  // A multiple-choice item that asks nothing is the shape that ships a bare
  // instruction ("read the passage below") with no question attached. The ask
  // may be a question in the stem or a blank inside the stimulus, so this reads
  // both: words-in-context items legitimately carry the blank in the passage.
  if (
    output.options &&
    !/\?|_{2,}/.test(`${output.stimulus ?? ""} ${output.assistantMessage}`)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["assistantMessage"],
      message:
        "the question must ask something: pose a question or leave a blank to complete",
    });
  }
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
    stimulus: z
      .string()
      .trim()
      .min(1)
      .max(4_000)
      .nullish()
      .describe(
        "The passage, data, code, or situation the question is about, reproduced in full because the learner sees nothing else. Null only when the question stands alone with no material to read.",
      ),
    assistantMessage: LearnerFacingMessageSchema.describe(
      "The question about the stimulus, plus how to answer it. Do not repeat the stimulus here or point at it with phrases like 'the passage below'.",
    ),
    verifier: selectedReviewVerifierSchema,
    options: z.array(reviewOptionSchema).length(4),
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

const mentorTeachingBase = {
  assistantMessage: LearnerFacingMessageSchema,
};

export const mentorOpeningOutputSchema = z
  .object({
    assistantMessage: LearnerFacingMessageSchema.describe(
      "The whole lesson, formatted by you: the heuristic, one worked example, and the closing check.",
    ),
    preparedScenario: z.null(),
  })
  .strict();

export const mentorTeachingOutputSchema = (
  selectedResponse: boolean,
  createScenario: boolean,
) =>
  createScenario
    ? mentorHandoffOutputSchema(selectedResponse)
    : mentorOpeningOutputSchema;

export const mentorHandoffOutputSchema = (selectedResponse: boolean) =>
  (selectedResponse
    ? z.object({
        ...mentorTeachingBase,
        preparedScenario: selectedReviewPresentationSchema,
      })
    : z.object({
        ...mentorTeachingBase,
        preparedScenario: openReviewPresentationSchema,
      })
  ).strict();

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

const evidenceSchema = z.string().trim().min(1);

export interface GradeShape {
  /** Exactly the dimensions the active challenge's contract tests. */
  readonly testedDimensionIds: readonly string[];
  /** The learner's latest answer, included in the critic prompt. */
  readonly learnerAnswer: string;
  /** Whether a failed grade will actually open the persisted feedback loop. */
  readonly interactiveFeedback: boolean;
}

/**
 * Grade plus critique. There is no verdict field: pass or fail is derived from
 * the scores the critic already committed to, so "did they get it" is never a
 * second, separately-fallible judgement call.
 */
export const reviewGradeSchema = ({ testedDimensionIds }: GradeShape) =>
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
            evidence: evidenceSchema,
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
    });

export const reviewFeedbackSchema = (promptRound: number) =>
  z
    .object({
      assistantMessage: LearnerFacingMessageSchema,
      feedbackComplete: z.boolean(),
      scratchpad: z.string().trim().min(1).max(600),
    })
    .strict()
    .transform((output) => ({
      ...output,
      feedbackComplete: promptRound === 3 || output.feedbackComplete,
    }));

// ---------------------------------------------------------------------------
// Presentation rules
//
// Deliberately not schema rules. These describe the shape of learner-facing
// prose, and prose shape must never invalidate a grade: the scores and evidence
// drive rating and mastery, so discarding them because a bold label is missing
// costs the learner a turn to fix a cosmetic defect. The runner asks once for a
// tidier reply and keeps the original either way.
// ---------------------------------------------------------------------------

const REPAIR_LABELS = ["What held", "Change", "Use next time"] as const;

const hasLabel = (message: string, label: string): boolean =>
  new RegExp(`\\*\\*${label}\\*\\*`, "i").test(message);

/**
 * Whether the reply closes on a single thing to answer. Only the closing block
 * counts: a rhetorical question inside the diagnosis is prose, not a second
 * ask, and counting every "?" in the message rejects good writing.
 */
const closesOnOneQuestion = (message: string): boolean => {
  const trimmed = message.trimEnd();
  if (!trimmed.endsWith("?")) return false;
  const closing = trimmed.split(/\n\s*\n/).at(-1) ?? trimmed;
  return (closing.match(/\?/g)?.length ?? 0) === 1;
};

export const getGradePresentationIssue = (
  output: Pick<ReviewGradeOutput, "assistantMessage" | "dimensionResults">,
  interactiveFeedback: boolean,
): string | null => {
  const message = output.assistantMessage;
  if (/\b(?:the mirror|the pivot|the crucible)\b/i.test(message)) {
    return "Write naturally: drop the named template sections.";
  }
  if (!hasModelGap(output.dimensionResults)) {
    const stray = REPAIR_LABELS.find((label) => hasLabel(message, label));
    if (stray) {
      return `The answer was clean, so there is nothing to repair: drop the **${stray}** section and confirm the answer in one short paragraph.`;
    }
    return message.includes("?")
      ? "The answer was clean: confirm what now holds and ask the learner nothing."
      : null;
  }
  const missing = REPAIR_LABELS.filter((label) => !hasLabel(message, label));
  if (missing.length > 0) {
    return `Label each repair section in bold, in this order: ${REPAIR_LABELS.map(
      (label) => `**${label}**`,
    ).join(", ")}. Missing: ${missing.join(", ")}.`;
  }
  if (!interactiveFeedback) {
    return message.includes("?")
      ? "This is a one-shot checkpoint: give the repair and close without asking a question."
      : null;
  }
  return closesOnOneQuestion(message)
    ? null
    : "End with exactly one short question for the learner, as the last thing in the reply, and ask nothing else in that closing paragraph.";
};

export const getFeedbackPresentationIssue = (
  output: Pick<ReviewFeedbackOutput, "assistantMessage" | "feedbackComplete">,
): string | null => {
  if (output.feedbackComplete) {
    return output.assistantMessage.includes("?")
      ? "This closes the feedback: confirm the corrected idea and ask nothing further."
      : null;
  }
  return closesOnOneQuestion(output.assistantMessage)
    ? null
    : "Feedback that continues must end with exactly one short question, as the last thing in the reply.";
};

export interface MentorTeachingOutput {
  readonly assistantMessage: string;
  readonly preparedScenario: ReviewPresentationOutput | null;
}
export type ReviewPresentationOutput = z.infer<
  ReturnType<typeof reviewPresentationSchema>
>;
export type ReviewGradeOutput = z.infer<ReturnType<typeof reviewGradeSchema>>;
export type ReviewFeedbackOutput = z.infer<
  ReturnType<typeof reviewFeedbackSchema>
>;
