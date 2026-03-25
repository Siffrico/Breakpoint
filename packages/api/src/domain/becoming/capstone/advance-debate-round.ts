import { z } from "zod/v4";

import { generateBecomingObject } from "../generate-becoming-object";

import type {
  CapstoneMessage,
  DebateCapstoneScenario,
} from "./types/capstone.types";

const DebateReplySchema = z.object({
  reply: z.string().min(1),
});

export const advanceDebateRound = async ({
  scenario,
  messages,
  round,
}: {
  scenario: DebateCapstoneScenario;
  messages: CapstoneMessage[];
  round: number;
}) => {
  const escalation =
    round === 1
      ? "surface the first concrete objection"
      : round === 2
        ? "escalate into a structural challenge"
        : "press on an edge case or failure mode";

  const result = await generateBecomingObject({
    schema: DebateReplySchema,
    errorMessage: "Failed to generate the next debate round.",
    system:
      "You are the opposing debater in a capstone. Be sharp, credible, and focused on the weakest exposed assumption.",
    prompt: `Generate the assistant's next debate move.

Resolution: ${scenario.resolution}
Context: ${scenario.context}
Your position: ${scenario.aiPosition}
Round to generate: ${round + 1}
Escalation goal: ${escalation}

Transcript so far:
${messages.map((message) => `${message.role.toUpperCase()} [round ${message.round}]: ${message.content}`).join("\n")}

Return a single assistant reply that advances the debate, not meta commentary.`,
  });

  return result.reply;
};
