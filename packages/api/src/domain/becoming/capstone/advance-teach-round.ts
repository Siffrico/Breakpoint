import { z } from "zod/v4";

import { generateBecomingObject } from "../generate-becoming-object";

import type { CapstoneMessage, TeachCapstoneScenario } from "./types/capstone.types";

const TeachReplySchema = z.object({
  reply: z.string().min(1),
});

export const advanceTeachRound = async ({
  scenario,
  messages,
  round,
}: {
  scenario: TeachCapstoneScenario;
  messages: CapstoneMessage[];
  round: number;
}) => {
  const pushback =
    round === 1
      ? "ask for clarification on the core idea"
      : round === 2
        ? "challenge whether the idea survives real constraints"
        : "raise the hardest skeptical objection that would expose shallow understanding";

  const result = await generateBecomingObject({
    schema: TeachReplySchema,
    errorMessage: "Failed to generate the next teach capstone round.",
    system:
      "You are the constrained audience in a capstone teaching exercise. Push back from the audience's real perspective.",
    prompt: `Generate the audience's next reply.

Audience: ${scenario.audience}
Audience context: ${scenario.audienceContext}
Delivery goal: ${scenario.deliveryGoal}
Round to generate: ${round + 1}
Pushback target: ${pushback}

Transcript so far:
${messages.map((message) => `${message.role.toUpperCase()} [round ${message.round}]: ${message.content}`).join("\n")}

Return one concise audience reply, grounded in the audience's constraints.`,
  });

  return result.reply;
};
