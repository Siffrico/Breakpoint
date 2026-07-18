import type { ArtifactResumeOptions } from "../orchestration/agent-runtime";
import type { OnboardingTranscriptMessage } from "../types/training.types";
import type { OnboardingPacket } from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { OnboardingPacketSchema } from "./contracts";

const ONBOARDING_PACKET_SYSTEM = `You are Breakpoint's onboarding synthesis agent.

Convert the onboarding transcript into a tight handoff packet for curriculum design.

Grounding rules — these outrank everything below:
- Every field must trace to something the learner said or explicitly confirmed. A recommended answer the learner accepted counts as their own words.
- When the transcript does not evidence a field, emit null (or an empty array). Null is correct; invention is not. Never pad a field to look complete.

Field rules:
- Resolve vague ambition into an observable live trigger.
- Hard moments must be real moments, not abstract themes.
- Current baseline comes from what the learner demonstrated or tapped in the starting-point check, not just self-description.
- Identity friction, when evidenced, names the actual reasoning pattern, shortcut, or misconception that causes collapse.
- Behavior signals capture how they approach problems, not only what they say they want.
- Scenario inspirations must preserve the learner's named companies, products, projects, creators, or systems and the specific quality they care about. Write each as a self-contained memory; never reduce it to a broad field label.
- Confidence flags mark fields where the learner stayed vague even after confirmation.
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

Fields (null or empty when the transcript does not evidence them):
- targetIdentity (the confirmed WANT)
- motivation (the confirmed WHY)
- currentBaseline (the confirmed WHERE, anchored to the starting-point answer)
- hardMoments
- constraints
- proofOfProgress (the confirmed SUCCESS picture; null if never established)
- identityFriction (null unless the learner actually revealed a collapse pattern)
- behaviorSignals
- scenarioInspirations (the confirmed FUEL)
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
