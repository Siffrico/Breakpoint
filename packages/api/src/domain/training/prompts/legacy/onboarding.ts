import type { PromptTemplate } from "../types";

import { identityProfilerPersona, onboardingInterviewerPersona } from "../personas";

export const onboardingStepPrompt: PromptTemplate = {
  id: "onboarding-step",
  version: 1,
  tier: "standard",
  persona: onboardingInterviewerPersona,
  instruction: `Choose the next onboarding step.

Rules:
- The first identity question has already been asked.
- You only get 3 follow-up questions total.
- If followUpCount is below 3, you must ask another question.
- If followUpCount is 3 or more, you must return complete.
- Pick the question with the highest information gain, not the most obvious slot.
- At least 2 of the 3 follow-up questions should probe psychology, identity friction, or behavior under pressure.
- Pick exactly one slot for the next question from: hard_moments, current_baseline, identity_friction, constraints, proof_of_progress.
- Do not re-ask target_identity.
- The prompt must be concise and feel elite, not chatty.
- The helper should be one short line that tightens the answer quality, or null.`,
  retryInstructions:
    "Obey the schema exactly. Do not add commentary outside the object. Be concrete and specific.",
};

export const identityReportPrompt: PromptTemplate = {
  id: "identity-report",
  version: 1,
  tier: "critical",
  persona: identityProfilerPersona,
  instruction: `Build a structured identity profile from this onboarding transcript.

Requirements:
- The transcript comes from a sparse, high-yield 4-question onboarding. Infer carefully from what is present.
- Resolve vague traits into observable behaviors.
- Hard moments should be concrete situations, not abstractions.
- currentBaseline should sound like a real performance gap.
- proofOfProgress should describe evidence, not feelings, even if it must be inferred from the target identity and failure pattern.
- confidenceFlags should only appear if the transcript is truly underspecified.
- Keep the language sharp and useful for downstream curriculum generation.`,
  retryInstructions:
    "Obey the schema exactly. Resolve vague traits into observable behaviors. Hard moments must be concrete situations.",
};
