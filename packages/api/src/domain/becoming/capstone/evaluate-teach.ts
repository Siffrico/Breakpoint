import { z } from "zod/v4";

import { executePrompt } from "../engine";
import { formatCapstoneTranscript } from "../prompts/fragments";
import { evaluateTeachPrompt } from "../prompts/legacy-registry";

import type {
  CapstoneEvaluation,
  CapstoneMessage,
  TeachCapstoneScenario,
} from "./types/capstone.types";

const TeachEvaluationWithReasoningSchema = z.object({
  reasoning: z.object({
    accuracy: z.string().min(1),
    audienceAdaptation: z.string().min(1),
    pushbackHandling: z.string().min(1),
    overallAssessment: z.string().min(1),
  }),
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().min(1),
});

export const evaluateTeachCapstone = async ({
  scenario,
  messages,
}: {
  scenario: TeachCapstoneScenario;
  messages: CapstoneMessage[];
}): Promise<CapstoneEvaluation> => {
  const result = await executePrompt({
    template: evaluateTeachPrompt,
    schema: TeachEvaluationWithReasoningSchema,
    context: {
      Title: scenario.title,
      Audience: scenario.audience,
      "Audience context": scenario.audienceContext,
      "Delivery goal": scenario.deliveryGoal,
      Transcript: formatCapstoneTranscript(messages),
    },
    errorMessage: "Failed to evaluate the teach capstone.",
  });

  return {
    passed: result.passed,
    score: result.score,
    feedback: result.feedback,
  };
};
