import { z } from "zod/v4";

import {
  DifficultyVectorSchema,
  EvaluationDimensionResultSchema,
  ScenarioEvaluationContractSchema,
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
    .strict();

const reviewChallengeFields = {
  difficultyVector: DifficultyVectorSchema,
  contract: ScenarioEvaluationContractSchema,
};

export const ReviewPresentationOutputSchema = z
  .object({
    assistantMessage: LearnerFacingMessageSchema,
    ...reviewChallengeFields,
  })
  .strict();

const reviewGradeBase = {
  assistantMessage: LearnerFacingMessageSchema,
  errorCodes: z.array(z.string().min(1)).max(3),
  gradeReasoning: z.string().min(12),
  dimensionResults: z.array(EvaluationDimensionResultSchema).min(1).max(4),
};

const continuingReview = z
  .object({
    ...reviewGradeBase,
    verdict: z.literal("continue"),
    nextChallenge: z.object(reviewChallengeFields).strict(),
  })
  .strict();

const passedReview = z
  .object({
    ...reviewGradeBase,
    verdict: z.literal("pass"),
    nextChallenge: z.null(),
  })
  .strict()
  .superRefine((output, ctx) => {
    const composite = Math.round(
      output.dimensionResults.reduce(
        (total, dimension) => total + dimension.score,
        0,
      ) / output.dimensionResults.length,
    );
    if (composite < 80) {
      ctx.addIssue({
        code: "custom",
        path: ["dimensionResults"],
        message: "A passing review requires a composite of at least 80.",
      });
    }
    output.dimensionResults.forEach((dimension, index) => {
      if (dimension.score < 70) {
        ctx.addIssue({
          code: "custom",
          path: ["dimensionResults", index, "score"],
          message:
            "A passing review requires every dimension to score at least 70.",
        });
      }
    });
    if (output.errorCodes.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["errorCodes"],
        message: "A passing review cannot retain failure error codes.",
      });
    }
  });

export const ReviewGradeOutputSchema = z.discriminatedUnion("verdict", [
  continuingReview,
  passedReview,
]);

export type MentorOutput = z.infer<ReturnType<typeof mentorOutputSchema>>;
export type ReviewPresentationOutput = z.infer<
  typeof ReviewPresentationOutputSchema
>;
export type ReviewGradeOutput = z.infer<typeof ReviewGradeOutputSchema>;
