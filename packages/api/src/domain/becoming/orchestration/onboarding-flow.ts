import type { OnboardingQuestion, OnboardingTranscriptMessage } from "../types/becoming.types";
import { buildOnboardingPacket, decideNextOnboardingStep } from "../agents/onboarding";

export const getNextOnboardingQuestion = ({
  transcript,
  followUpCount,
}: {
  transcript: OnboardingTranscriptMessage[];
  followUpCount: number;
}): Promise<OnboardingQuestion | null> =>
  decideNextOnboardingStep({
    transcript,
    followUpCount,
  });

export const createOnboardingPacket = (
  transcript: OnboardingTranscriptMessage[],
) => buildOnboardingPacket(transcript);
