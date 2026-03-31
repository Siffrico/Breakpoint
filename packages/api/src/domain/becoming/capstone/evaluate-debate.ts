import { z } from "zod/v4";

import { executePrompt } from "../engine";
import { formatCapstoneTranscript } from "../prompts/fragments";
import { evaluateDebatePrompt } from "../prompts/registry";

import type {
  CapstoneEvaluation,
  CapstoneMessage,
  DebateCapstoneScenario,
} from "./types/capstone.types";

const DebateEvaluationWithReasoningSchema = z.object({
  reasoning: z.object({
    conceptApplication: z.string().min(1),
    consistencyUnderPressure: z.string().min(1),
    judgmentQuality: z.string().min(1),
    overallAssessment: z.string().min(1),
  }),
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().min(1),
});

export const evaluateDebateCapstone = async ({
  scenario,
  messages,
}: {
  scenario: DebateCapstoneScenario;
  messages: CapstoneMessage[];
}): Promise<CapstoneEvaluation> => {
  const result = await executePrompt({
    template: evaluateDebatePrompt,
    schema: DebateEvaluationWithReasoningSchema,
    context: {
      Title: scenario.title,
      Resolution: scenario.resolution,
      Context: scenario.context,
      "AI position": scenario.aiPosition,
      Transcript: formatCapstoneTranscript(messages),
    },
    errorMessage: "Failed to evaluate the debate capstone.",
  });

  return {
    passed: result.passed,
    score: result.score,
    feedback: result.feedback,
  };
};
