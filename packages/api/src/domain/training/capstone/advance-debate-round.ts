import { z } from "zod/v4";

import { executePrompt } from "../engine";
import { formatCapstoneTranscript } from "../prompts/fragments";
import { debateRoundPrompt } from "../prompts/legacy-registry";

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

  const result = await executePrompt({
    template: debateRoundPrompt,
    schema: DebateReplySchema,
    context: {
      Resolution: scenario.resolution,
      Context: scenario.context,
      "Your position": scenario.aiPosition,
      "Round to generate": String(round + 1),
      "Escalation goal": escalation,
      "Transcript so far": formatCapstoneTranscript(messages),
    },
    errorMessage: "Failed to generate the next debate round.",
  });

  return result.reply;
};
