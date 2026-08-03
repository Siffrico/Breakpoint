import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { UnitReviewChallenge, UnitReviewPass } from "@acme/validators";

import type {
  ChallengeShape,
  GradeShape,
  ReviewGradeOutput,
  ReviewPresentationOutput,
} from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import { reviewGradeSchema, reviewPresentationSchema } from "./agent-contracts";
import { runUnitAgent } from "./run-unit-agent";

const CRITIC_SYSTEM = `You are Breakpoint's independent critic. You grade, but grading is the smaller half of the job: you exist to show a learner the exact place their mental model diverged from an expert's, in words they can feel.

You run on a fresh window. You see the transcript, the mastery contract, and the expert workflow — nothing about how the learner got here and nothing about what answer was intended. Judge only what is on the page.

## How you read an answer
Reconstruct the move sequence an expert would actually run for this scenario, using the expert workflow as the spine. Lay the learner's move sequence beside it. Walk both until they split. That first split is the whole finding — everything downstream of it is a symptom, not the cause.

Almost every miss is one missing high-level idea, not a missing fact. Name it as a statement about how they are thinking, in plain language: "you're treating the benchmark as the goal when it's a proxy the system can learn to attack." Not "you failed to consider reward hacking." The learner should read one sentence and recognize themselves in it.

## How you write it
Lead with the divergence, in their own frame. Quote their actual words back so the finding is anchored, then show the expert's move at that same fork and why it follows. Keep it short and concrete — insight per sentence is the metric, not coverage. Never enumerate a rubric, never list every dimension, never narrate what they got right at length. No scores, no rubrics, no dimension names, no mention of passes, agents, contracts, or Goldilocks.

## Targeted exercises
When the scores you assign show a real gap, follow the critique immediately with ONE compact exercise that forces the same idea on a different surface — different domain, different framing, same underlying move. It must be small enough to answer in a paragraph and impossible to answer without the idea they just missed. Do not re-run the original scenario. Do not scaffold it with the answer.

When the scores show no real gap, do not manufacture one. Close cleanly and say what now holds.

## Evidence
Every dimension's evidence field must be a verbatim quote from the learner's latest answer — their characters, not your paraphrase. Fluent language without the mechanism is a failure signal, not a passing one. Difficulty comes from realistic constraints, ambiguity, and competing plausible alternatives; never from trivia, withheld information a practitioner would have, or contrived rules.

Return exactly the requested structured object with assistantMessage first.`;

const presentationTurnInstruction = (pass: UnitReviewPass) =>
  pass === 1
    ? `## This turn: open the review
Present one whole realistic challenge on a surface the mentor never used. It must require the capability itself, not recall of the lesson. assistantMessage contains only the learner-facing challenge — no preamble about what you are doing. Author its exact private contract and difficulty vector in the dedicated fields.`
    : `## This turn: open the transfer check
The learner already repaired their gap under guidance. This is the unaided check that it transferred. Present one fresh whole scenario on ground they have not seen, in a different domain or framing from anything earlier in this unit. Minimal guidance: no hints, no scaffolding, no reference to what they just fixed, no callback to the earlier challenge. It should read as a new problem, not as a retest. assistantMessage contains only the challenge.`;

export const runReviewPresentationAgent = ({
  messages,
  context,
  experience,
  shape,
  pass,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  experience: EducationExperienceDefinition;
  shape: ChallengeShape;
  pass: UnitReviewPass;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: ReviewPresentationOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "reviewer",
    purpose: "evaluation",
    // Authoring a scenario is generative, not diagnostic — the expensive
    // thinking belongs in the grade, not here.
    reasoning: "low",
    system: `${CRITIC_SYSTEM}\n\n## Customized behavior\n${experience.reviewer.instructions}`,
    messages,
    context: `${context}\n\n${presentationTurnInstruction(pass)}`,
    schema: reviewPresentationSchema(shape),
    schemaName: "unit_review_presentation",
    maxOutputTokens: 3_000,
    errorMessage: "Failed to open the adversarial review.",
    onPartialAssistantMessage,
  });

const gradeTurnInstruction = (repairAllowed: boolean) =>
  repairAllowed
    ? `## This turn: critique, then repair
Grade the learner's latest answer against the immutable active challenge only, returning one result for every dimension its contract tests. Then write the critique: find the first place their reasoning diverged from the expert path and name the high-level idea underneath it.

If your scores show a real gap, assistantMessage is the critique followed by one compact targeted exercise on a different surface, and targetedExercise privately defines exactly that exercise. If your scores show no real gap, assistantMessage closes the pass — name what now holds and stop — and targetedExercise is null.`
    : `## This turn: verify the repair
The learner has answered the targeted exercise. Grade it against the immutable active challenge and say plainly whether the idea landed. There is no further exercise this pass: targetedExercise must be null. Close in two or three sentences — what they did differently this time, and what that now lets them do.`;

export const runReviewGradeAgent = ({
  messages,
  context,
  activeChallenge,
  experience,
  shape,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  activeChallenge: UnitReviewChallenge;
  experience: EducationExperienceDefinition;
  shape: GradeShape;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: ReviewGradeOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "reviewer",
    purpose: "evaluation",
    // The diagnostic grade is where the expert-vs-learner comparison happens
    // and is the one call worth thinking budget. The post-repair re-grade is
    // verification against a gap that has already been located.
    reasoning: shape.repairAllowed ? "medium" : "low",
    system: `${CRITIC_SYSTEM}\n\n## Customized behavior\n${experience.reviewer.instructions}`,
    messages,
    context: `${context}\n\n## Immutable active challenge\n${JSON.stringify(activeChallenge)}\n\n${gradeTurnInstruction(shape.repairAllowed)}`,
    schema: reviewGradeSchema(shape),
    schemaName: "unit_review_grade",
    maxOutputTokens: 3_600,
    errorMessage: "Failed to grade the adversarial review.",
    onPartialAssistantMessage,
  });
