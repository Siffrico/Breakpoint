import { z } from "zod/v4";

import { executePrompt } from "../engine";
import { formatCapstoneTranscript } from "../prompts/fragments";
import { evaluateBuildPrompt } from "../prompts/registry";

import type {
  BuildCapstoneScenario,
  CapstoneEvaluation,
  CapstoneMessage,
} from "./types/capstone.types";

const BuildEvaluationWithReasoningSchema = z.object({
  reasoning: z.object({
    skillIntegration: z.string().min(1),
    criteriaSatisfaction: z.string().min(1),
    depthAndRigor: z.string().min(1),
    overallAssessment: z.string().min(1),
  }),
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().min(1),
});

export const evaluateBuildCapstone = async ({
  scenario,
  messages,
}: {
  scenario: BuildCapstoneScenario;
  messages: CapstoneMessage[];
}): Promise<CapstoneEvaluation> => {
  const latestSubmission =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const result = await executePrompt({
    template: evaluateBuildPrompt,
    schema: BuildEvaluationWithReasoningSchema,
    context: {
      Title: scenario.title,
      "Artifact type": scenario.artifactType,
      Briefing: scenario.briefing,
      Constraints: scenario.constraints.join("; "),
      "Evaluation criteria": scenario.evaluationCriteria.join("; "),
      Transcript: formatCapstoneTranscript(messages),
      "Latest learner submission": latestSubmission,
    },
    errorMessage: "Failed to evaluate the build capstone.",
  });

  return {
    passed: result.passed,
    score: result.score,
    feedback: result.feedback,
  };
};
