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

/**
 * One part of a round. The model picks which of the round's criteria the part
 * tests, and writes exactly one private check per criterion it picked.
 */
const openPartSchema = (roundCriterionIds: readonly string[]) =>
  z
    .object({
      question: LearnerFacingMessageSchema.max(2_000).describe(
        "This part's question plus how to answer it. Do not restate the shared situation.",
      ),
      criterionIds: z
        .array(z.enum(roundCriterionIds))
        .min(1)
        .max(roundCriterionIds.length)
        .describe("The round criteria this part tests."),
      verifier: z
        .object({
          kind: z.literal("checks"),
          checks: z
            .array(
              z
                .object({
                  criterionId: z.enum(roundCriterionIds),
                  check: z
                    .string()
                    .trim()
                    .min(1)
                    .max(500)
                    .describe(
                      "One sentence stating what a passing answer to this part must do for this criterion, concrete enough that a reader can point to the satisfying sentence.",
                    ),
                })
                .strict(),
            )
            .min(1)
            .max(roundCriterionIds.length),
          scratchpad: z
            .string()
            .trim()
            .min(24)
            .max(600)
            .describe(
              "A concise private check, 24 to 600 characters, of the required reasoning. Never shown to the learner.",
            ),
        })
        .strict(),
    })
    .strict()
    .superRefine((part, ctx) => {
      const checked = part.verifier.checks.map((check) => check.criterionId);
      if (
        new Set(part.criterionIds).size !== part.criterionIds.length ||
        checked.length !== part.criterionIds.length ||
        part.criterionIds.some((id) => !checked.includes(id))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["verifier", "checks"],
          message:
            "Give exactly one check for every criterion this part tests, and none for others.",
        });
      }
      refineReviewPresentation(
        { assistantMessage: part.question, verifier: part.verifier },
        ctx,
      );
    });

const selectedPartSchema = (roundCriterionIds: readonly string[]) =>
  z
    .object({
      stimulus: z
        .string()
        .trim()
        .min(1)
        .max(4_000)
        .nullish()
        .describe(
          "Extra material only this part needs, reproduced in full. Null when the shared situation is enough.",
        ),
      question: LearnerFacingMessageSchema.max(2_000).describe(
        "This part's question. Do not restate the shared situation.",
      ),
      options: z.array(reviewOptionSchema).length(4),
      criterionIds: z
        .array(z.enum(roundCriterionIds))
        .min(1)
        .max(roundCriterionIds.length)
        .describe("The round criteria this part tests."),
      verifier: selectedReviewVerifierSchema,
    })
    .strict()
    .superRefine((part, ctx) => {
      if (new Set(part.criterionIds).size !== part.criterionIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["criterionIds"],
          message: "List each criterion once.",
        });
      }
      refineReviewPresentation(
        {
          stimulus: part.stimulus,
          assistantMessage: part.question,
          options: part.options,
          verifier: part.verifier,
        },
        ctx,
      );
    });

export interface PartsShape {
  readonly selectedResponse: boolean;
  readonly roundCriterionIds: readonly string[];
  /** How many parts this call writes. */
  readonly partCount: number;
  /** Criteria the written parts must test between them. */
  readonly mustCoverCriterionIds: readonly string[];
  readonly opensRound: boolean;
  readonly acknowledgesExplanation: boolean;
}

export const mentorPartsOutputSchema = (shape: PartsShape) =>
  z
    .object({
      acknowledgment: shape.acknowledgesExplanation
        ? LearnerFacingMessageSchema.max(1_200).describe(
            "A brief reply to the learner's explain-back: confirm it, or give one concrete correction if it is wrong. No question.",
          )
        : z.null(),
      narrative: shape.opensRound
        ? LearnerFacingMessageSchema.max(4_000).describe(
            "The shared situation every part of this round is about: the concrete setup, data, or material, reproduced in full. No question here.",
          )
        : z.null(),
      parts: z
        .array(
          shape.selectedResponse
            ? selectedPartSchema(shape.roundCriterionIds)
            : openPartSchema(shape.roundCriterionIds),
        )
        .length(shape.partCount),
    })
    .strict()
    .superRefine((output, ctx) => {
      const covered = new Set(output.parts.flatMap((part) => part.criterionIds));
      const uncovered = shape.mustCoverCriterionIds.filter(
        (id) => !covered.has(id),
      );
      if (uncovered.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["parts"],
          message: `These criteria must be tested by the parts you write: ${uncovered.join(", ")}.`,
        });
      }
    });

export type MentorPartsOutput = z.infer<
  ReturnType<typeof mentorPartsOutputSchema>
>;
export type MentorPartOutput = MentorPartsOutput["parts"][number];

/** The learner-facing text of one part, without its label. */
export const renderPart = (part: MentorPartOutput): string =>
  renderReviewPresentation({
    stimulus: "stimulus" in part ? part.stimulus : null,
    assistantMessage: part.question,
    options: "options" in part ? part.options : undefined,
  });

export const renderLabeledPart = (letter: string, question: string): string =>
  `**Part (${letter})**\n\n${question}`;

/**
 * The same layout over a half-streamed parts object, so the learner watches
 * the round appear and the first-visible clock is satisfied.
 */
export const renderPartialParts =
  (firstLetterIndex: number) =>
  (partial: unknown): string | undefined => {
    if (typeof partial !== "object" || partial === null) return undefined;
    const { acknowledgment, narrative, parts } = partial as {
      acknowledgment?: unknown;
      narrative?: unknown;
      parts?: unknown;
    };
    const rendered = Array.isArray(parts)
      ? parts.flatMap((part: unknown, index) => {
          if (typeof part !== "object" || part === null) return [];
          const { stimulus, question, options } = part as {
            stimulus?: unknown;
            question?: unknown;
            options?: unknown;
          };
          const body = [
            typeof stimulus === "string" ? stimulus.trim() : null,
            typeof question === "string" ? question.trim() : null,
            Array.isArray(options)
              ? options
                  .flatMap((option: unknown) => {
                    const { label, text } = (option ?? {}) as {
                      label?: unknown;
                      text?: unknown;
                    };
                    return typeof label === "string" && typeof text === "string"
                      ? [`${label}) ${text.trim()}`]
                      : [];
                  })
                  .join("\n\n")
              : null,
          ]
            .filter((value): value is string => Boolean(value))
            .join("\n\n");
          return body
            ? [
                renderLabeledPart(
                  String.fromCharCode("a".charCodeAt(0) + firstLetterIndex + index),
                  body,
                ),
              ]
            : [];
        })
      : [];
    const text = [
      typeof acknowledgment === "string" ? acknowledgment.trim() : null,
      typeof narrative === "string" ? narrative.trim() : null,
      ...rendered,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");
    return text || undefined;
  };

export const mentorLessonOutputSchema = z
  .object({
    assistantMessage: LearnerFacingMessageSchema.describe(
      "The whole lesson, formatted by you: the easy version, one worked example, and the closing explain-back prompt.",
    ),
  })
  .strict();

export const hasModelGap = (
  results: readonly Pick<EvaluationDimensionResult, "met">[],
): boolean => results.some((result) => !result.met);

const evidenceSchema = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .describe(
    "The exact characters from the learner's answer that decided this check. Null only when their answer contains nothing for this part.",
  );

export interface GradeShape {
  /** Exactly the criteria the part being graded tests. */
  readonly testedDimensionIds: readonly string[];
  /** The learner's latest answer, included in the critic prompt. */
  readonly learnerAnswer: string;
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
  .nullable()
  .describe(
    "The learner's own words, copied exactly from their latest answer, covering the move that went wrong. Never your paraphrase. Null only when their answer contains nothing for this part.",
  );

const diagnosisSchema = z
  .object({
    quote: quoteSchema,
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

export type UnitDiagnosis = z.infer<typeof diagnosisSchema>;

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
    diagnosis.quote ? quoteBlock(diagnosis.quote) : null,
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
}: GradeShape) =>
  z
    .object({
      closingMessage: LearnerFacingMessageSchema.max(1_200)
        .nullable()
        .describe(
          "Only when the answer is clean: one short paragraph confirming it and naming the evidence that decided it. Null whenever there is a gap.",
        ),
      diagnosis: diagnosisSchema
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
        .length(testedDimensionIds.length),
    })
    .strict()
    .superRefine((output, ctx) => {
      const dimensionResults = output.dimensionResults;
      const gradedIds = dimensionResults.map((result) => result.dimensionId);
      if (new Set(gradedIds).size !== gradedIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["dimensionResults"],
          message: "Grade each tested dimension exactly once.",
        });
      }
      dimensionResults.forEach((result, index) => {
        if (result.evidence === null) {
          if (result.met) {
            ctx.addIssue({
              code: "custom",
              path: ["dimensionResults", index, "evidence"],
              message: "A met check needs evidence quoted from the answer.",
            });
          }
          return;
        }
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
      const gap = hasModelGap(dimensionResults);
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

export type ReviewGradeOutput = z.infer<ReturnType<typeof reviewGradeSchema>>;
