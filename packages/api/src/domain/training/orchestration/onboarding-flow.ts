import type { OnboardingTranscriptMessage } from "../types/training.types";
import { buildOnboardingPacket } from "../agents/onboarding";

export const createOnboardingPacket = (
  transcript: OnboardingTranscriptMessage[],
) => buildOnboardingPacket(transcript);
