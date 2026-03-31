import { z } from "zod/v4";
import { PracticePromptSchema } from "@acme/validators";

import { executePrompt } from "./engine";
import { practicePromptsPrompt } from "./prompts/registry";
import type { PracticePrompt } from "./types/becoming.types";

const PracticePromptListSchema = z.object({
  practicePrompts: z.array(PracticePromptSchema).length(3),
});

export const generatePracticePrompts = async ({
  unitTitle,
  unitSummary,
  seedResponse,
  buildContent,
  targetIdentity,
}: {
  unitTitle: string;
  unitSummary: string;
  seedResponse: string;
  buildContent: string;
  targetIdentity: string;
}): Promise<PracticePrompt[]> => {
  const result = await executePrompt({
    template: practicePromptsPrompt,
    schema: PracticePromptListSchema,
    context: {
      "Target identity": targetIdentity,
      "Unit title": unitTitle,
      "Unit summary": unitSummary,
      "Learner seed response": seedResponse,
      "Build content": buildContent,
    },
    errorMessage: "Failed to generate practice prompts.",
  });

  return result.practicePrompts;
};
