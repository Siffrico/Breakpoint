import type { ArtifactResumeOptions } from "../orchestration/agent-runtime";
import type { OnboardingTranscriptMessage } from "../types/training.types";
import type { OnboardingPacket } from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { OnboardingPacketSchema } from "./contracts";

const ONBOARDING_PACKET_SYSTEM = `You are Breakpoint's onboarding synthesis agent.

Convert the onboarding transcript into a tight handoff packet for curriculum design.

Rules:
- Resolve vague ambition into an observable live trigger.
- Hard moments must be real moments, not abstract themes.
- Current baseline should reflect what the learner revealed in any concrete task or walkthrough, not just self-description.
- Identity friction should name the actual reasoning pattern, shortcut, or misconception that causes collapse.
- Behavior signals should capture how they approach problems, not only what they say they want.
- Scenario inspirations must preserve the learner's named companies, products, projects, creators, or systems and the specific quality they care about. Write each as a self-contained memory; never reduce it to a broad field label.
- Confidence flags should appear only when evidence is truly weak.
- Do not romanticize the learner.`;

export const buildOnboardingPacket = async (
  transcript: OnboardingTranscriptMessage[],
  options?: ArtifactResumeOptions<OnboardingPacket>,
): Promise<OnboardingPacket> =>
  runResilientAgent({
    agent: "onboarding",
    system: ONBOARDING_PACKET_SYSTEM,
    schema: OnboardingPacketSchema,
    errorMessage: "Failed to build the onboarding handoff packet.",
    onPartial: options?.onPartial,
    seedPartial: options?.seedPartial,
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
- scenarioInspirations
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
