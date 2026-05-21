import type { OnboardingTranscriptMessage } from "../types/training.types";
import { OnboardingPacketSchema, type OnboardingPacket } from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";

const ONBOARDING_PACKET_SYSTEM = `You are Breakpoint's onboarding synthesis agent.

Convert the onboarding transcript into a tight handoff packet for curriculum design.

Rules:
- Resolve vague ambition into an observable live trigger.
- Hard moments must be real moments, not abstract themes.
- Current baseline should reflect what the learner revealed in any concrete task or walkthrough, not just self-description.
- Identity friction should name the actual reasoning pattern, shortcut, or misconception that causes collapse.
- Behavior signals should capture how they approach problems, not only what they say they want.
- Confidence flags should appear only when evidence is truly weak.
- Do not romanticize the learner.`;

export const buildOnboardingPacket = async (
  transcript: OnboardingTranscriptMessage[],
): Promise<OnboardingPacket> =>
  runAgent({
    agent: "onboarding",
    system: ONBOARDING_PACKET_SYSTEM,
    schema: OnboardingPacketSchema,
    errorMessage: "Failed to build the onboarding handoff packet.",
    prompt: `Build the onboarding packet from this transcript.

Required fields:
- targetIdentity
- motivation
- currentBaseline
- hardMoments
- constraints
- proofOfProgress
- identityFriction
- behaviorSignals
- confidenceFlags

Transcript:
${formatOnboardingTranscript(transcript)}`,
  });

const formatOnboardingTranscript = (
  messages: OnboardingTranscriptMessage[],
): string =>
  messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}${message.slot ? ` [${message.slot}]` : ""}: ${message.content}`,
    )
    .join("\n");
