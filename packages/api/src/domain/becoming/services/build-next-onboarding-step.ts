import { generateObject } from "ai";
import { z } from "zod/v4";

import { OnboardingSlotSchema } from "@acme/validators";

import type {
  OnboardingQuestion,
  OnboardingTranscriptMessage,
} from "../types/becoming.types";
import { getModelForTier } from "../engine/model-router";
import { composePrompt } from "../prompts/compose";
import { formatOnboardingTranscript } from "../prompts/fragments";
import { onboardingStepPrompt } from "../prompts/legacy-registry";

const NextOnboardingStepSchema = z.object({
  decision: z.enum(["ask", "complete"]),
  question: z
    .object({
      slot: OnboardingSlotSchema.exclude(["target_identity"]),
      prompt: z.string().min(1),
      helper: z.string().min(1).nullable(),
    })
    .nullable(),
});

export const buildNextOnboardingStep = async ({
  transcript,
  followUpCount,
}: {
  transcript: OnboardingTranscriptMessage[];
  followUpCount: number;
}): Promise<OnboardingQuestion | null> => {
  const model = getModelForTier(onboardingStepPrompt.tier);
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated onboarding.");
  }

  const composed = composePrompt(onboardingStepPrompt, {
    "Current followUpCount": String(followUpCount),
    Transcript: formatOnboardingTranscript(transcript),
  });

  const { object } = await generateObject({
    model,
    schema: NextOnboardingStepSchema,
    system: composed.system,
    prompt: composed.prompt,
  });

  if (object.decision === "complete" || !object.question) {
    return null;
  }

  return {
    ...object.question,
    sequence: followUpCount + 1,
  };
};
