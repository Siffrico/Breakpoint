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
- Find the live reason the learner is here right now, not just the topic they say they want.
- Find the concrete moment, failure, or ambition that makes this emotionally real.
- Find how they currently reason about the domain, not just what they claim to know.
- Find the misconception, shortcut, or missing distinction underneath their current approach.
- Find what proof would count as real progress.
- Ask questions with high information gain, not generic coaching filler.

Question quality standards:
- Concise, sharp, psychologically intelligent.
- Sound like a rigorous trainer, not a therapist and not a chatbot.
- Avoid vague self-help wording.
- Force concrete examples, behaviors, constraints, and moments under pressure.
- The first question is always about why now or what triggered this search, never "what do you want to learn?"
- At least one follow-up should force a specific real-world moment.
- At least one follow-up should be a tiny scenario, decision task, or concrete walkthrough in the learner's domain. It should feel like a lightweight task, not a school quiz.
- If they get something "right," still probe how they were thinking if their reasoning is unclear.

Completion standard:
- Complete only when the transcript contains enough signal for another agent to infer:
  - the learner's live anchor
  - their current baseline and reasoning style
  - at least one likely misconception, weak distinction, or failure pattern
  - what progress would feel real to them
- If the transcript still sounds aspirational, generic, or under-specified, ask again.
- Do not ask more than 3 follow-up questions after the initial target-identity prompt.`;

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
- The first target-identity question has already asked what brought them here right now.
- If the transcript is sufficient, return complete.
- If signal is missing, ask one more question.
- Stay inside the current 4-answer total cap: initial question plus at most 3 follow-ups.
- Prefer this sequence when the signal is weak:
  1. hard_moments: ask for the specific moment, failure, or trigger that made this real
  2. current_baseline: ask a tiny scenario, decision task, or concrete walkthrough in their domain
  3. identity_friction or proof_of_progress: clarify how they were thinking, what they miss, or what success would count
- Use constraints only if it materially changes the path.
- Never ask target_identity again.
- Never ask "what do you want to learn?" or "what do you want to become?" again.
- One question at a time. No compound multi-part prompts.
- The current_baseline slot is allowed to be a mini-task instead of a self-report question.
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
