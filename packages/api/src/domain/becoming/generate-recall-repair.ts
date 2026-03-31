import { z } from "zod/v4";

import { executePrompt } from "./engine";
import { recallRepairPrompt } from "./prompts/registry";

const RecallRepairSchema = z.object({
  prompt: z.string().min(1),
});

export const generateRecallRepair = async ({
  prompt,
  response,
  feedback,
  decayTarget,
  sourceContext,
}: {
  prompt: string;
  response: string;
  feedback: string;
  decayTarget: string | null;
  sourceContext: string;
}) =>
  executePrompt({
    template: recallRepairPrompt,
    schema: RecallRepairSchema,
    context: {
      "Original probe": prompt,
      "Learner response": response,
      Evaluation: feedback,
      ...(decayTarget ? { "Decay target": decayTarget } : {}),
      "Source context": sourceContext,
    },
    errorMessage: "Failed to generate the recall repair prompt.",
  });
