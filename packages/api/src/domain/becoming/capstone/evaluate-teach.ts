import { CapstoneEvaluationSchema } from "@acme/validators";

import { generateBecomingObject } from "../generate-becoming-object";

import type {
  CapstoneEvaluation,
  CapstoneMessage,
  TeachCapstoneScenario,
} from "./types/capstone.types";

export const evaluateTeachCapstone = async ({
  scenario,
  messages,
}: {
  scenario: TeachCapstoneScenario;
  messages: CapstoneMessage[];
}): Promise<CapstoneEvaluation> => {
  return generateBecomingObject({
    schema: CapstoneEvaluationSchema,
    errorMessage: "Failed to evaluate the teach capstone.",
    system:
      "You evaluate teaching capstones for accuracy, completeness, audience fit, and the ability to handle pushback without losing the core insight.",
    prompt: `Evaluate this teach capstone.

Title: ${scenario.title}
Audience: ${scenario.audience}
Audience context: ${scenario.audienceContext}
Delivery goal: ${scenario.deliveryGoal}

Transcript:
${messages.map((message) => `${message.role.toUpperCase()} [round ${message.round}]: ${message.content}`).join("\n")}

Return:
- passed: true only if the learner taught the idea accurately and adapted to the audience constraints instead of giving a generic explanation.
- score: 0-100.
- feedback: one concise paragraph with what landed and what remained unclear or unconvincing.`,
  });
};
