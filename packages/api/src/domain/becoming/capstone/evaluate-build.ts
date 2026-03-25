import { CapstoneEvaluationSchema } from "@acme/validators";

import { generateBecomingObject } from "../generate-becoming-object";

import type {
  BuildCapstoneScenario,
  CapstoneEvaluation,
  CapstoneMessage,
} from "./types/capstone.types";

export const evaluateBuildCapstone = async ({
  scenario,
  messages,
}: {
  scenario: BuildCapstoneScenario;
  messages: CapstoneMessage[];
}): Promise<CapstoneEvaluation> => {
  const latestSubmission =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  return generateBecomingObject({
    schema: CapstoneEvaluationSchema,
    errorMessage: "Failed to evaluate the build capstone.",
    system:
      "You evaluate capstone artifacts for integrated skill application. Be strict, concrete, and educationally honest.",
    prompt: `Evaluate this build capstone.

Title: ${scenario.title}
Artifact type: ${scenario.artifactType}
Briefing: ${scenario.briefing}
Constraints: ${scenario.constraints.join("; ")}
Evaluation criteria: ${scenario.evaluationCriteria.join("; ")}

Transcript:
${messages.map((message) => `${message.role.toUpperCase()} [round ${message.round}]: ${message.content}`).join("\n")}

Latest learner submission:
${latestSubmission}

Return:
- passed: true only if the artifact clearly satisfies the capstone bar now.
- score: 0-100.
- feedback: one concise paragraph that names what is strong and what is still weak.

The feedback should be directly usable as revision guidance if passed is false.`,
  });
};
