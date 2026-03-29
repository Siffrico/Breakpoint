import { generateObject } from "ai";

import { IdentityReportSchema } from "@acme/validators";

import type { IdentityReport, OnboardingTranscriptMessage } from "../types/becoming.types";
import { getBecomingModel } from "./becoming-model";

const formatTranscript = (messages: OnboardingTranscriptMessage[]) =>
  messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}${message.slot ? ` [${message.slot}]` : ""}: ${message.content}`,
    )
    .join("\n");

export const buildIdentityReport = async (
  messages: OnboardingTranscriptMessage[],
): Promise<IdentityReport> => {
  const model = getBecomingModel();
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated identity reports.");
  }

  const { object } = await generateObject({
    model,
    schema: IdentityReportSchema,
    system:
      "You build identity profiles for an adaptive training product. Convert vague ambition into a concrete operator profile, observable behaviors, hard moments, and useful uncertainty flags. Be diagnostic, specific, and unsentimental.",
    prompt: `Build a structured identity profile from this onboarding transcript.

Requirements:
- The transcript comes from a sparse, high-yield 4-question onboarding. Infer carefully from what is present.
- Resolve vague traits into observable behaviors.
- Hard moments should be concrete situations, not abstractions.
- currentBaseline should sound like a real performance gap.
- proofOfProgress should describe evidence, not feelings, even if it must be inferred from the target identity and failure pattern.
- confidenceFlags should only appear if the transcript is truly underspecified.
- Keep the language sharp and useful for downstream curriculum generation.

Transcript:
${formatTranscript(messages)}`,
  });

  return object;
};
