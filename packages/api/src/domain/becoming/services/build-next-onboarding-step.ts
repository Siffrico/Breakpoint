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
      "You are the onboarding interviewer for an identity-driven training product. Ask one high-leverage follow-up question at a time. The goal is to understand the operator the user wants to become, where they break down now, what hard moments matter, what constraints are real, and what proof of progress would count. Be sharp, minimal, and specific. Never ask fluffy or repetitive questions.",
    prompt: `Choose the next onboarding step.

Rules:
- The first identity question has already been asked.
- Ask between 3 and 5 follow-up questions total.
- If followUpCount is below 3, you must ask another question.
- If followUpCount is 5 or more, you must return complete.
- Between 3 and 5, complete only if the transcript is specific enough to build a strong curriculum.
- Pick exactly one slot for the next question from: hard_moments, current_baseline, constraints, proof_of_progress.
- Do not re-ask target_identity.
- The prompt must be concise and feel elite, not chatty.
- The helper should be one short line that tightens the answer quality, or null.

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
