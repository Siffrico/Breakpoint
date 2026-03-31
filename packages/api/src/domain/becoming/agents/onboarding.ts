import type { OnboardingQuestion, OnboardingTranscriptMessage } from "../types/becoming.types";
import {
  OnboardingDecisionSchema,
  OnboardingPacketSchema,
  type OnboardingPacket,
} from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";

const ONBOARDING_SYSTEM = `You are Breakpoint's onboarding agent.

Your job is to extract the minimum number of questions that produce maximum downstream curriculum quality.

Non-negotiable goals:
- Find the operator the learner wants to become.
- Find where they actually break under pressure.
- Find the identity friction that keeps them inconsistent.
- Find what proof would count as real progress.
- Ask questions with high information gain, not generic coaching filler.

Question quality standards:
- Concise, sharp, psychologically intelligent.
- Sound like a rigorous trainer, not a therapist and not a chatbot.
- Avoid vague self-help wording.
- Force concrete examples, behaviors, constraints, and moments under pressure.

Completion standard:
- Complete only when the transcript contains enough signal for another agent to build a serious curriculum.
- If the transcript still sounds aspirational, generic, or under-specified, ask again.
- Do not ask more than 3 follow-up questions after the initial target-identity prompt.`;

const ONBOARDING_PACKET_SYSTEM = `You are Breakpoint's onboarding synthesis agent.

Convert the onboarding transcript into a tight handoff packet for curriculum design.

Rules:
- Resolve vague ambition into observable behavior.
- Hard moments must be real moments, not abstract themes.
- Identity friction should name the actual pattern that causes collapse.
- Behavior signals should be actionable and specific.
- Confidence flags should appear only when evidence is truly weak.
- Do not romanticize the learner.`;

export const decideNextOnboardingStep = async ({
  transcript,
  followUpCount,
}: {
  transcript: OnboardingTranscriptMessage[];
  followUpCount: number;
}): Promise<OnboardingQuestion | null> => {
  const result = await runAgent({
    agent: "onboarding",
    system: ONBOARDING_SYSTEM,
    schema: OnboardingDecisionSchema,
    errorMessage: "Failed to generate the next onboarding question.",
    prompt: `Choose the next onboarding action.

Rules:
- The first target-identity question has already been asked.
- If the transcript is sufficient, return complete.
- If signal is missing, ask one more question.
- Prefer these slots when missing or weak: hard_moments, current_baseline, identity_friction, constraints, proof_of_progress.
- Never ask target_identity again.
- The helper must be one short line or null.

Current follow-up count: ${followUpCount}
Maximum follow-up count: 3

Transcript:
${formatOnboardingTranscript(transcript)}`,
  });

  if (result.decision === "complete" || !result.question) {
    return null;
  }

  return {
    ...result.question,
    sequence: followUpCount + 1,
  };
};

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
