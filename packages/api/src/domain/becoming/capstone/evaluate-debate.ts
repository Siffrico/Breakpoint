import { CapstoneEvaluationSchema } from "@acme/validators";

import { generateBecomingObject } from "../generate-becoming-object";

import type {
  CapstoneEvaluation,
  CapstoneMessage,
  DebateCapstoneScenario,
} from "./types/capstone.types";

export const evaluateDebateCapstone = async ({
  scenario,
  messages,
}: {
  scenario: DebateCapstoneScenario;
  messages: CapstoneMessage[];
}): Promise<CapstoneEvaluation> => {
  return generateBecomingObject({
    schema: CapstoneEvaluationSchema,
    errorMessage: "Failed to evaluate the debate capstone.",
    system:
      "You evaluate debate capstones for concept use, judgment, and pressure-tested reasoning. Reward use of the cluster's principles, not generic rhetoric.",
    prompt: `Evaluate this debate capstone.

Title: ${scenario.title}
Resolution: ${scenario.resolution}
Context: ${scenario.context}
AI position: ${scenario.aiPosition}

Transcript:
${messages.map((message) => `${message.role.toUpperCase()} [round ${message.round}]: ${message.content}`).join("\n")}

Return:
- passed: true only if the learner consistently defended the resolution using the cluster's concepts across the full exchange.
- score: 0-100.
- feedback: one concise paragraph with the strongest evidence for the score and the biggest missing move if they failed.`,
  });
};
