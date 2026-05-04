import { z } from "zod/v4";

import { executePrompt } from "./engine";
import { buildContentPrompt } from "./prompts/legacy-registry";

const BuildContentSchema = z.object({
  buildContent: z.string().min(200),
});

export const generateBuildContent = async ({
  unitTitle,
  unitSummary,
  whyItMatters,
  seedResponse,
  targetIdentity,
}: {
  unitTitle: string;
  unitSummary: string;
  whyItMatters: string;
  seedResponse: string;
  targetIdentity: string;
}): Promise<string> => {
  const trimmedSeed = seedResponse.trim();
  if (!trimmedSeed) {
    throw new Error("Seed response is required before build content can be generated.");
  }

  const result = await executePrompt({
    template: buildContentPrompt,
    schema: BuildContentSchema,
    context: {
      "Target identity": targetIdentity,
      "Unit title": unitTitle,
      "Unit summary": unitSummary,
      "Why it matters": whyItMatters,
      "Learner seed response": trimmedSeed,
    },
    errorMessage: "Failed to generate build content.",
  });

  return result.buildContent;
};
