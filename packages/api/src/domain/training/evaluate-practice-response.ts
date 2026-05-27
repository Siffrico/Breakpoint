import { PracticeEvaluationSchema } from "@acme/validators";

import { generateTrainingObject } from "./generate-training-object";
import type {
  PracticeEvaluation,
  PracticePrompt,
} from "./types/training.types";

const criteriaByType: Record<PracticePrompt["type"], string> = {
  identification:
    "Did the learner use the new framework to reinterpret the past event instead of merely describing what happened? Did they show genuine insight using the specific model from the build content?",
  construction:
    "Did the learner actually build or design something that embodies the principle? Is it concrete, specific, and structurally faithful to the model?",
  debugging:
    "Did the learner correctly identify why the scenario fails using the principle? Did they name the specific broken mechanism? Does the proposed fix address the root cause rather than the symptom?",
};

export const evaluatePracticeResponse = async ({
  practicePrompt,
  userResponse,
  unitTitle,
  buildContent,
}: {
  practicePrompt: PracticePrompt;
  userResponse: string;
  unitTitle: string;
  buildContent: string;
}): Promise<PracticeEvaluation> =>
  generateTrainingObject({
    schema: PracticeEvaluationSchema,
    purpose: "evaluation",
    errorMessage: "Failed to evaluate the practice response.",
    system:
      "You are evaluating whether a learner has genuinely applied a concept, not just restated it. Be demanding. Vague application fails. Generic responses fail. Only pass when the learner demonstrates they can actually DO something with the concept.",
    retryPromptSuffix:
      "- Fail vague responses.\n- feedback must name what was missing or what was done well.\n- Judge application against the specific model in the build content.",
    prompt: `Evaluate this practice response.

Evaluation focus for this round type:
${criteriaByType[practicePrompt.type]}

Fail conditions across all round types:
- Vague language
- Restating the principle without applying it
- Surface-level observations
- Not connecting to the specific model from the build content

Unit title: ${unitTitle}
Round type: ${practicePrompt.type}
Practice prompt:
${practicePrompt.prompt}

Build content:
${buildContent}

Learner response:
${userResponse}`,
  });
