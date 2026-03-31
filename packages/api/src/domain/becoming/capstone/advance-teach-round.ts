import { z } from "zod/v4";

import { executePrompt } from "../engine";
import { formatCapstoneTranscript } from "../prompts/fragments";
import { teachRoundPrompt } from "../prompts/registry";

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

  const result = await executePrompt({
    template: teachRoundPrompt,
    schema: TeachReplySchema,
    context: {
      Audience: scenario.audience,
      "Audience context": scenario.audienceContext,
      "Delivery goal": scenario.deliveryGoal,
      "Round to generate": String(round + 1),
      "Pushback target": pushback,
      "Transcript so far": formatCapstoneTranscript(messages),
    },
    errorMessage: "Failed to generate the next teach capstone round.",
  });

  return result.reply;
};
