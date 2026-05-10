import type { OnboardingTranscriptMessage } from "../types/becoming.types";
import { buildOnboardingPacket } from "../agents/onboarding";

export const createOnboardingPacket = (
  transcript: OnboardingTranscriptMessage[],
) => buildOnboardingPacket(transcript);
