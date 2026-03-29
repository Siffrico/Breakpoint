import { generateObject } from "ai";
import { z } from "zod/v4";

import { OnboardingSlotSchema } from "@acme/validators";

import type {
  OnboardingQuestion,
  OnboardingTranscriptMessage,
} from "../types/becoming.types";
import { getBecomingModel } from "./becoming-model";

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

const formatTranscript = (messages: OnboardingTranscriptMessage[]) =>
  messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}${message.slot ? ` [${message.slot}]` : ""}: ${message.content}`,
    )
    .join("\n");

export const buildNextOnboardingStep = async ({
  transcript,
  followUpCount,
}: {
  transcript: OnboardingTranscriptMessage[];
  followUpCount: number;
}): Promise<OnboardingQuestion | null> => {
  const model = getBecomingModel();
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated onboarding.");
  }

  const { object } = await generateObject({
    model,
    schema: NextOnboardingStepSchema,
    system:
      "You are the onboarding interviewer for an identity-driven training product. Use a power-law approach: ask the fewest questions that reveal the most. Your job is to identify current capability, behavior under pressure, identity friction, and the constraints that actually shape execution. Prefer psychology-informed questions that expose hidden patterns over generic intake prompts. Be sharp, minimal, and specific. Never ask fluffy, repetitive, or low-yield questions.",
    prompt: `Choose the next onboarding step.

Rules:
- The first identity question has already been asked.
- You only get 3 follow-up questions total.
- If followUpCount is below 3, you must ask another question.
- If followUpCount is 3 or more, you must return complete.
- Pick the question with the highest information gain, not the most obvious slot.
- At least 2 of the 3 follow-up questions should probe psychology, identity friction, or behavior under pressure.
- Pick exactly one slot for the next question from: hard_moments, current_baseline, identity_friction, constraints, proof_of_progress.
- Do not re-ask target_identity.
- The prompt must be concise and feel elite, not chatty.
- The helper should be one short line that tightens the answer quality, or null.
- Avoid low-yield biography. Ask for real moments, internal reactions, or repeat constraints.

Current followUpCount: ${followUpCount}

Transcript:
${formatTranscript(transcript)}`,
  });

  if (object.decision === "complete" || !object.question) {
    return null;
  }

  return {
    ...object.question,
    sequence: followUpCount + 1,
  };
};
