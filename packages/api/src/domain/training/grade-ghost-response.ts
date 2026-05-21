import { z } from "zod/v4";

import { executePrompt } from "./engine";
import { formatGapContext } from "./prompts/fragments";
import { gradeGhostPrompt } from "./prompts/legacy-registry";
import type {
  FailureGap,
  GhostEvaluation,
  GhostScenario,
} from "./types/training.types";

/**
 * Internal schema with CoT reasoning for ghost evaluation.
 */
const GhostEvaluationWithReasoningSchema = z.object({
  reasoning: z.object({
    gapAddressing: z.string().min(1),
    transferQuality: z.string().min(1),
    overallAssessment: z.string().min(1),
  }),
  passed: z.boolean(),
  feedback: z.string().min(1),
  score: z.number().int().min(0).max(100),
});

export const gradeGhostResponse = async ({
  ghostScenario,
  gap,
  response,
}: {
  ghostScenario: GhostScenario;
  gap: FailureGap;
  response: string;
}): Promise<GhostEvaluation> => {
  const result = await executePrompt({
    template: gradeGhostPrompt,
    schema: GhostEvaluationWithReasoningSchema,
    context: {
      "Original gap": formatGapContext(gap),
      "Ghost scenario domain": ghostScenario.domain,
      "Ghost scenario prompt": ghostScenario.prompt,
      "Learner response": response,
    },
    errorMessage: "Failed to evaluate the ghost response.",
  });

  return {
    passed: result.passed,
    feedback: result.feedback,
    score: result.score,
  };
};
