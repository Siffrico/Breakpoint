import { z } from "zod/v4";

import type {
  EvaluationDimensionResult,
  ScenarioVerifier,
} from "@acme/validators";
import {
  UnitDiagnosisCauseSchema,
  UnitErrorCodeSchema,
} from "@acme/validators";

import { getReviewPresentationReadinessIssue } from "./unit-readiness";

/**
 * Private authoring data in a learner-facing field is not a style defect: a
 * leaked verifier hands over the answer and destroys the scenario, so this is
 * a blocking rule rather than an advisory one, and it guards every path that
 * writes to the learner rather than the scenario path alone.
 */
const PRIVATE_AUTHORING_DATA = /<\/?scratchpad>|verifier\.|checkerSpec/i;

export const LearnerFacingMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_000)
  .refine(
    (message) => !PRIVATE_AUTHORING_DATA.test(message),
    "learner-facing text must not expose private authoring data",
  )
  .describe(
    "The Markdown shown to the learner. It must read as finished and self-contained: no drafting notes, no private reasoning, no answer.",
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
};

const selectedReviewVerifierSchema = z
  .object({
    kind: z.literal("fixed_answer"),
    answer: z
      .enum(["A", "B", "C", "D"])
      .describe("The one correct option label."),
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

const checksReviewVerifierSchema = (testedCriterionIds: readonly string[]) =>
  z
    .object({
      kind: z.literal("checks"),
      checks: z
        .array(
          z
            .object({
              criterionId: z.enum(testedCriterionIds),
              check: z
                .string()
                .trim()
                .min(1)
                .max(500)
                .describe(
                  "One sentence stating what a passing answer must do for this criterion, concrete enough that a reader can point to the satisfying sentence.",
                ),
            })
            .strict(),
        )
        .length(testedCriterionIds.length),
      scratchpad: z
        .string()
        .trim()
        .min(24)
        .max(600)
        .describe(
          "A concise private check, 24 to 600 characters, of the required reasoning. Do not repeat the prompt. This is never shown to the learner.",
        ),
    })
    .strict()
    .superRefine((verifier, ctx) => {
      const ids = verifier.checks.map((check) => check.criterionId);
      if (
        new Set(ids).size !== ids.length ||
        testedCriterionIds.some((criterionId) => !ids.includes(criterionId))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["checks"],
          message: "Provide exactly one check for every tested criterion.",
        });
      }
    });

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
    readonly verifier: ScenarioVerifier;
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
  // The rendered scenario concatenates fields, so a leak can appear in the
  // seam between them even when each field passed on its own.
  if (PRIVATE_AUTHORING_DATA.test(assistantMessage)) {
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

const openReviewPresentationSchema = (testedCriterionIds: readonly string[]) =>
  z
    .object({
      ...reviewPresentationBase,
      verifier: checksReviewVerifierSchema(testedCriterionIds),
    })
    .strict()
    .superRefine(refineReviewPresentation);

export const reviewPresentationSchema = (
  selectedResponse: boolean,
  testedCriterionIds: readonly string[],
) =>
  selectedResponse
    ? selectedReviewPresentationSchema
    : openReviewPresentationSchema(testedCriterionIds);

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
  testedCriterionIds: readonly string[],
) =>
  createScenario
    ? mentorHandoffOutputSchema(selectedResponse, testedCriterionIds)
    : mentorOpeningOutputSchema;

export const mentorHandoffOutputSchema = (
  selectedResponse: boolean,
  testedCriterionIds: readonly string[],
) =>
  (selectedResponse
    ? z.object({
        ...mentorTeachingBase,
        preparedScenario: selectedReviewPresentationSchema,
      })
    : z.object({
        ...mentorTeachingBase,
        preparedScenario: openReviewPresentationSchema(testedCriterionIds),
      })
  ).strict();

export const hasModelGap = (
  results: readonly Pick<EvaluationDimensionResult, "met">[],
): boolean => results.some((result) => !result.met);

const evidenceSchema = z.string().trim().min(1);

export interface GradeShape {
  /** Exactly the dimensions the active challenge's contract tests. */
  readonly testedDimensionIds: readonly string[];
  /** The learner's latest answer, included in the critic prompt. */
  readonly learnerAnswer: string;
  readonly decidedMet: boolean | null;
}

/**
 * The diagnosis, as fields rather than prose. The critic writes the content
 * and `renderGradeMessage` lays it out, which is why there are no formatting
 * rules here: the model cannot get the shape wrong if it never chooses it.
 */
const quoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .describe(
    "The learner's own words, copied exactly from their latest answer, covering the move that went wrong. Never your paraphrase.",
  );

// A decided verdict (a wrong option letter) has no prose to quote.
const diagnosisSchema = (quoteRequired: boolean) =>
  z
    .object({
      quote: quoteRequired ? quoteSchema : quoteSchema.nullable(),
      hypothesis: z
      .string()
      .trim()
      .min(1)
      .max(400)
      .describe(
        "A tentative statement of the idea you believe the learner is holding, written so they can push back on it.",
      ),
    explanation: LearnerFacingMessageSchema.max(1_200).describe(
      "A concise explanation of the concrete consequence that makes that idea break in this scenario.",
    ),
  })
  .strict();

export type UnitDiagnosis = z.infer<ReturnType<typeof diagnosisSchema>>;

const quoteBlock = (quote: string): string =>
  quote
    .trim()
    .split("\n")
    .map((line) => `> ${line.trim()}`)
    .join("\n");

/**
 * Turns the diagnosis fields into the Markdown the learner reads. Server-side
 * on purpose: layout stops being something the critic can get wrong, and the
 * five presentation checks that used to police bold labels stop being needed.
 */
export const renderGradeMessage = (output: {
  readonly closingMessage: string | null;
  readonly diagnosis: UnitDiagnosis | null;
}): string => {
  const { diagnosis } = output;
  if (!diagnosis) return output.closingMessage ?? "";
  return [
    diagnosis.quote === null ? null : quoteBlock(diagnosis.quote),
    diagnosis.hypothesis.trim(),
    diagnosis.explanation.trim(),
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");
};

/**
 * The same layout over a half-streamed object. Fields arrive in schema order
 * and any of them can still be absent or a truncated string, so every part is
 * optional here and the result grows as the object fills in.
 */
export const renderPartialGradeMessage = (
  partial: unknown,
): string | undefined => {
  if (typeof partial !== "object" || partial === null) return undefined;
  const { closingMessage, diagnosis } = partial as {
    closingMessage?: unknown;
    diagnosis?: unknown;
  };
  if (typeof closingMessage === "string") return closingMessage;
  if (typeof diagnosis !== "object" || diagnosis === null) return undefined;
  const { quote, hypothesis, explanation } = diagnosis as {
    quote?: unknown;
    hypothesis?: unknown;
    explanation?: unknown;
  };
  const parts = [
    typeof quote === "string" && quote.trim() ? quoteBlock(quote) : null,
    typeof hypothesis === "string" ? hypothesis.trim() : null,
    typeof explanation === "string" ? explanation.trim() : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("\n\n") : undefined;
};

export const reviewGradeSchema = ({
  testedDimensionIds,
  learnerAnswer,
  decidedMet,
}: GradeShape) =>
  z
    .object({
      closingMessage: LearnerFacingMessageSchema.max(1_200)
        .nullable()
        .describe(
          "Only when the answer is clean: one short paragraph confirming it and naming the evidence that decided it. Null whenever there is a gap.",
        ),
      diagnosis: diagnosisSchema(decidedMet === null)
        .nullable()
        .describe(
          "Only when the answer has a gap. Null whenever the answer is clean.",
        ),
      causeType: UnitDiagnosisCauseSchema.nullable().describe(
        "Why the answer diverged. `wrong-rule` when they applied a rule that does not hold here. `missed-limit` when they never took a constraint in this scenario into account. `never-learned-it` when the idea was never taught to them. Null whenever the answer is clean.",
      ),
      errorCodes: z
        .array(UnitErrorCodeSchema)
        .max(3)
        .describe(
          "One to three lowercase kebab-case names for the mistake, most important first. Reuse a code from this run's earlier codes verbatim when it is the same mistake: a new synonym splits one record into two and the repair never completes. Empty whenever the answer is clean.",
        ),
      scratchpad: z
        .string()
        .trim()
        .min(1)
        .max(600)
        .describe(
          "Private. Never shown to the learner. What they were sensibly going for, the idea that made it look right, and why you chose this cause.",
        ),
      dimensionResults: z
        .array(
          z
            .object({
              dimensionId: z.enum(testedDimensionIds),
              met: z.boolean(),
              evidence: evidenceSchema,
              missing: z.string().trim().min(1).nullable(),
            })
            .strict(),
        )
        .length(testedDimensionIds.length)
        .optional(),
    })
    .strict()
    .superRefine((output, ctx) => {
      const dimensionResults = output.dimensionResults ?? [];
      const gradedIds = dimensionResults.map((result) => result.dimensionId);
      if (decidedMet === null) {
        if (!output.dimensionResults) {
          ctx.addIssue({
            code: "custom",
            path: ["dimensionResults"],
            message: "Grade every tested dimension.",
          });
        }
        if (new Set(gradedIds).size !== gradedIds.length) {
          ctx.addIssue({
            code: "custom",
            path: ["dimensionResults"],
            message: "Grade each tested dimension exactly once.",
          });
        }
        dimensionResults.forEach((result, index) => {
          if (
            !learnerAnswer
              .replace(/\s+/g, " ")
              .trim()
              .includes(result.evidence.replace(/\s+/g, " ").trim())
          ) {
            ctx.addIssue({
              code: "custom",
              path: ["dimensionResults", index, "evidence"],
              message: "Evidence must quote the learner's answer.",
            });
          }
        });
      } else if (output.dimensionResults !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["dimensionResults"],
          message: "Omit dimension results when the verdict is already decided.",
        });
      }
      if (
        output.diagnosis?.quote &&
        !learnerAnswer
          .replace(/\s+/g, " ")
          .trim()
          .includes(output.diagnosis.quote.replace(/\s+/g, " ").trim())
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["diagnosis", "quote"],
          message: "Diagnosis quote must quote the learner's answer.",
        });
      }
      const gap =
        decidedMet === null ? hasModelGap(dimensionResults) : !decidedMet;
      const require = (
        condition: boolean,
        path: string,
        message: string,
      ): void => {
        if (!condition) ctx.addIssue({ code: "custom", path: [path], message });
      };
      if (gap) {
        require(output.diagnosis !==
          null, "diagnosis", "The answer leaves a gap, so name it: write the diagnosis and set closingMessage to null.");
        require(output.causeType !==
          null, "causeType", "The answer leaves a gap, so classify what caused it.");
        require(output.errorCodes.length >
          0, "errorCodes", "The answer leaves a gap, so give at least one error code for it.");
        require(output.closingMessage ===
          null, "closingMessage", "The answer leaves a gap, so there is nothing to close on: set closingMessage to null.");
        return;
      }
      require(output.closingMessage !==
        null, "closingMessage", "Every check is met, so confirm the answer in closingMessage.");
      require(output.diagnosis ===
        null, "diagnosis", "Every check is met, so set diagnosis to null rather than inventing a flaw.");
      require(output.causeType ===
        null, "causeType", "Every check is met, so set causeType to null.");
      require(output.errorCodes.length ===
        0, "errorCodes", "Every check is met, so leave errorCodes empty.");
    });

export interface MentorTeachingOutput {
  readonly assistantMessage: string;
  readonly preparedScenario: ReviewPresentationOutput | null;
}
export type ReviewPresentationOutput = z.infer<
  ReturnType<typeof reviewPresentationSchema>
>;
export type ReviewGradeOutput = z.infer<ReturnType<typeof reviewGradeSchema>>;
