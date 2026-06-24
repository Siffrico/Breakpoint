import type { OnboardingPacket } from "../agents/contracts";
import type { OnboardingTranscriptMessage } from "../types/training.types";
import type { ArtifactResumeOptions } from "./agent-runtime";
import { buildOnboardingPacket } from "../agents/onboarding";

export const createOnboardingPacket = (
  transcript: OnboardingTranscriptMessage[],
  options?: ArtifactResumeOptions<OnboardingPacket>,
) => buildOnboardingPacket(transcript, options);
