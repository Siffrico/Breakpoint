import { GhostEvaluationSchema } from "@acme/validators";

import { generateBecomingObject } from "./generate-becoming-object";
import type {
  FailureGap,
  GhostEvaluation,
  GhostScenario,
} from "./types/becoming.types";

export const gradeGhostResponse = async ({
  ghostScenario,
  gap,
  response,
}: {
  ghostScenario: GhostScenario;
  gap: FailureGap;
  response: string;
}): Promise<GhostEvaluation> =>
  generateBecomingObject({
    schema: GhostEvaluationSchema,
    errorMessage: "Failed to evaluate the ghost response.",
    system:
      "You are evaluating whether a learner has addressed their specific reasoning gap in a new context.",
    retryPromptSuffix:
      "- The only thing being tested is whether the response addresses the original gap.\n- Pass threshold is 65 or above.",
    prompt: `Evaluate this ghost response.

Original gap:
Description: ${gap.description}
Gap type: ${gap.gapType}
Where it broke: ${gap.whereItBroke}

Ghost scenario domain: ${ghostScenario.domain}
Ghost scenario prompt:
${ghostScenario.prompt}

Learner response:
${response}`,
  });
