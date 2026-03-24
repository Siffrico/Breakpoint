import { z } from "zod/v4";
import { PracticePromptSchema } from "@acme/validators";

import { generateBecomingObject } from "./generate-becoming-object";
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
  const result = await generateBecomingObject({
    schema: PracticePromptListSchema,
    errorMessage: "Failed to generate practice prompts.",
    system:
      "You are designing three deliberate practice rounds. Each round must force genuine application of the concept taught in the build content. Reference the learner's own experiences where possible. Never ask for recall. Always require the learner to DO something with the concept.",
    retryPromptSuffix:
      "- Return exactly 3 prompts in order: identification, construction, debugging.\n- The debugging prompt must include a brief broken scenario inside the prompt.",
    prompt: `Design the practice rounds for this learner.

Rules:
1. Return exactly 3 prompts.
2. prompts[0] must have type "identification".
3. prompts[1] must have type "construction".
4. prompts[2] must have type "debugging".
5. Identification: ask the learner to reanalyze something from their own past using the new framework. If the seed includes a personal example, use it.
6. Construction: ask the learner to design or build something using the principle. It must be generative, not analytical.
7. Debugging: include a 2-3 sentence broken scenario inside the prompt. The scenario must violate the principle. The learner must diagnose why it fails and propose a fix.
8. The debugging scenario must be adjacent to the unit topic, not the exact same domain.
9. Never ask for definition recall or summary.
10. Make each prompt specific enough that a vague answer will obviously fail.

Target identity: ${targetIdentity}
Unit title: ${unitTitle}
Unit summary: ${unitSummary}

Learner seed response:
${seedResponse}

Build content:
${buildContent}`,
  });

  return result.practicePrompts;
};
