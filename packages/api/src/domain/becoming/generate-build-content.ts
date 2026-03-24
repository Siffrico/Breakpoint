import { z } from "zod/v4";

import { generateBecomingObject } from "./generate-becoming-object";

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

  const result = await generateBecomingObject({
    schema: BuildContentSchema,
    errorMessage: "Failed to generate build content.",
    system:
      "You are writing the core argument of a training unit. Your job is not to teach - it is to disrupt, then rebuild. You are a mentor who respects the learner enough to show them exactly where their current understanding fails before giving them the better model.",
    retryPromptSuffix:
      "- Continuous prose only.\n- No bullet points or headers.\n- Open by referencing the learner's actual seed response.\n- Keep it between 400 and 600 words.",
    prompt: `Write the build content for this unit.

Rules:
1. The opening must reference something the learner specifically wrote in their seed response.
2. Structure the argument in this order: disrupt, rebuild, ground, land.
3. Disrupt: open with a concrete counterexample showing where the learner's current model breaks.
4. Rebuild: introduce the deeper model and explain why the surface model fails.
5. Ground: show the model operating in something mundane or everyday.
6. Land: end with exactly one transferable principle sentence.
7. Tone: direct, sharp, challenging, respectful. Not textbook. Not warm. Not motivational.
8. Never say "you were wrong."
9. Never use phrases like "in this section" or "we will explore."
10. Continuous prose only. No lists. No headings.

Target identity: ${targetIdentity}
Unit title: ${unitTitle}
Unit summary: ${unitSummary}
Why it matters: ${whyItMatters}

Learner seed response:
${trimmedSeed}`,
  });

  return result.buildContent;
};
