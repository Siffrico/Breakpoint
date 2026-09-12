import { z } from "zod/v4";

import type { EvaluationDimensionResult } from "@acme/validators";
import {
  EvaluationDimensionResultSchema,
  ScenarioVerifierSchema,
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
  /**
   * Whether these scores cover every target in the unit contract. The turn
   * treats an uncovered target as a gap, so the schema has to use the same
   * definition or the critic can hand back a clean confirmation for an answer
   * the runner then records as a failure.
   */
  readonly evidencesAllTargets: (
    results: readonly EvaluationDimensionResult[],
  ) => boolean;
}

/**
 * The diagnosis, as fields rather than prose. The critic writes the content
 * and `renderGradeMessage` lays it out, which is why there are no formatting
 * rules here: the model cannot get the shape wrong if it never chooses it.
 */
const diagnosisSchema = z
  .object({
    quote: z
      .string()
      .trim()
      .min(3)
      .max(400)
      .describe(
        "The learner's own words, copied exactly from their latest answer, covering the move that went wrong. Never your paraphrase.",
      ),
    hypothesis: z
      .string()
      .trim()
      .min(12)
      .max(240)
      .regex(
        /^I think you\b/,
        'the hypothesis must start with "I think you", because it is a guess the learner can push back on, not a verdict',
      )
      .describe(
        'One sentence starting "I think you", naming the idea you believe they are holding. Use the plainest words that carry it.',
      ),
    why: z
      .array(z.string().trim().min(3).max(120))
      .min(2)
      .max(4)
      .describe(
        "Two to four short lines showing why that idea breaks here. One idea per line, each a complete sentence, each under 120 characters. Concrete nouns only: name things the learner could point at or count.",
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
    quoteBlock(diagnosis.quote),
    diagnosis.hypothesis.trim(),
    ...diagnosis.why.map((line) => line.trim()),
  ].join("\n\n");
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
  const { quote, hypothesis, why } = diagnosis as {
    quote?: unknown;
    hypothesis?: unknown;
    why?: unknown;
  };
  const parts = [
    typeof quote === "string" && quote.trim() ? quoteBlock(quote) : null,
    typeof hypothesis === "string" ? hypothesis.trim() : null,
    ...(Array.isArray(why) ? why : []).map((line) =>
      typeof line === "string" ? line.trim() : null,
    ),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("\n\n") : undefined;
};

/**
 * Grade plus diagnosis. There is no verdict field: pass or fail is derived from
 * the scores the critic already committed to, so "did they get it" is never a
 * second, separately-fallible judgement call. The diagnosis is derived the same
 * way, by requiring it exactly when those scores say there is something to
 * repair.
 */
export const reviewGradeSchema = ({
  testedDimensionIds,
  evidencesAllTargets,
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
        .min(24)
        .max(600)
        .describe(
          "Private. Never shown to the learner. What they were sensibly going for, the idea that made it look right, and why you chose this cause.",
        ),
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
      const gap =
        hasModelGap(output.dimensionResults) ||
        !evidencesAllTargets(output.dimensionResults);
      const require = (
        condition: boolean,
        path: string,
        message: string,
      ): void => {
        if (!condition) ctx.addIssue({ code: "custom", path: [path], message });
      };
      if (gap) {
        require(output.diagnosis !==
          null, "diagnosis", "These scores leave a gap, so name it: write the diagnosis and set closingMessage to null.");
        require(output.causeType !==
          null, "causeType", "These scores leave a gap, so classify what caused it.");
        require(output.errorCodes.length >
          0, "errorCodes", "These scores leave a gap, so give at least one error code for it.");
        require(output.closingMessage ===
          null, "closingMessage", "These scores leave a gap, so there is nothing to close on: set closingMessage to null.");
        return;
      }
      require(output.closingMessage !==
        null, "closingMessage", "These scores are clean, so confirm the answer in closingMessage.");
      require(output.diagnosis ===
        null, "diagnosis", "These scores are clean, so there is no gap to name: set diagnosis to null rather than inventing a flaw.");
      require(output.causeType ===
        null, "causeType", "These scores are clean, so set causeType to null.");
      require(output.errorCodes.length ===
        0, "errorCodes", "These scores are clean, so leave errorCodes empty.");
    });

// ---------------------------------------------------------------------------
// Presentation rules
//
// Deliberately not schema rules. These describe the wording of learner-facing
// text, and wording must never invalidate a grade: the scores and evidence
// drive rating and mastery, so discarding them costs the learner a turn to fix
// something cosmetic. The runner asks once for a better reply and keeps the
// original either way.
//
// There is only one rule left. Layout used to live here as five checks for
// bold labels and closing questions; `renderGradeMessage` now owns layout, so
// those checks have nothing to police.
// ---------------------------------------------------------------------------

/**
 * Words that describe the learner's thinking from the outside. Each one has a
 * plainer version that says the same thing, and the learner has to translate
 * before they can act on any sentence built from these.
 */
const ABSTRACT_WORDS = [
  "abstraction",
  "assumption",
  "cognitive",
  "conceptual",
  "criteri(?:on|a)",
  "dimension",
  "framework",
  "heuristic",
  "mental model",
  "methodology",
  "paradigm",
  "proxy",
  "rubric",
  "underlying principle",
] as const;

const ABSTRACT_WORD_PATTERN = new RegExp(
  `\\b(?:${ABSTRACT_WORDS.join("|")})\\b`,
  "gi",
);

export const getGradePresentationIssue = (
  output: Pick<ReviewGradeOutput, "closingMessage" | "diagnosis">,
): string | null => {
  const learnerText = [
    output.closingMessage ?? "",
    output.diagnosis?.hypothesis ?? "",
    ...(output.diagnosis?.why ?? []),
  ].join("\n");
  const found = [
    ...new Set(
      (learnerText.match(ABSTRACT_WORD_PATTERN) ?? []).map((word) =>
        word.toLowerCase(),
      ),
    ),
  ];
  return found.length === 0
    ? null
    : `Rewrite without these words, naming the concrete thing instead: ${found.join(", ")}. Every noun should be something the learner could point at or count.`;
};

export interface MentorTeachingOutput {
  readonly assistantMessage: string;
  readonly preparedScenario: ReviewPresentationOutput | null;
}
export type ReviewPresentationOutput = z.infer<
  ReturnType<typeof reviewPresentationSchema>
>;
export type ReviewGradeOutput = z.infer<ReturnType<typeof reviewGradeSchema>>;
