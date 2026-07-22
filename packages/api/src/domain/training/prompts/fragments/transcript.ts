import type {
  OnboardingTranscriptMessage,
  TeachbackMessage,
} from "../../types/training.types";

export const formatOnboardingTranscript = (
  messages: OnboardingTranscriptMessage[],
): string =>
  messages
    .map(
      (m) =>
        `${m.role.toUpperCase()}${m.slot ? ` [${m.slot}]` : ""}: ${m.content}`,
    )
    .join("\n");

export const formatTeachbackTranscript = (
  messages: TeachbackMessage[],
): string =>
  messages
    .map((m) => `${m.role.toUpperCase()} (round ${m.round}): ${m.content}`)
    .join("\n");
