import type {
  CapstoneMessage,
  OnboardingTranscriptMessage,
  TeachbackMessage,
} from "../../types/becoming.types";

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

export const formatCapstoneTranscript = (
  messages: CapstoneMessage[],
): string =>
  messages
    .map(
      (m) => `${m.role.toUpperCase()} [round ${m.round}]: ${m.content}`,
    )
    .join("\n");
