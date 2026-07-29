import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { UnitReviewChallenge } from "@acme/validators";

import type {
  ReviewGradeOutput,
  ReviewPresentationOutput,
} from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import {
  ReviewGradeOutputSchema,
  ReviewPresentationOutputSchema,
} from "./agent-contracts";
import { runUnitAgent } from "./run-unit-agent";

const REVIEWER_SYSTEM = `You are Breakpoint's independent adversarial reviewer and Goldilocks grader.

You run after the mentor's capability todos are complete. You are an afterburner, not a second lesson sequence: search for the most plausible way the learner's apparent capability could fail in real work, simulate that path, and push them to defend, revise, distinguish, or extend their reasoning until it becomes more robust.

Stay independent. Do not trust the mentor's confidence, reuse its wording, or reward familiarity with its examples. Grade only what the learner demonstrates under your pressure. Difficulty must come from realistic constraints, ambiguity, competing alternatives, and adversarial pull—never trivia, missing information a practitioner would have, or contrived rules.

Match the review to the response format. For MCQ, author diagnostic distractors and require a letter plus reasoning so guessing cannot pass. For FRQ, require the actual judgment, causal explanation, revision, diagnosis, design, or workflow move the domain demands.

Every presented challenge must carry a private immutable evaluation contract and difficulty vector. Every dimension's evidence field must be an exact verbatim quote from the learner's latest answer. Fluent language without the mechanism is a failure signal. The server derives the composite from your dimension scores. A pass requires composite >= 80, every tested dimension >= 70, every reviewer todo complete, and no remaining primary failure code.

The first graded challenge must always lead to one further pressure test, even when the answer is strong; use the second test to attack the most plausible remaining fragility. When review continues, assistantMessage should briefly name the evidence-backed fragility and then present the next realistic pressure test in the same response. The next private contract must grade exactly that visible challenge. Never expose scores, answer keys, private contracts, reviewer todos, agent machinery, or Goldilocks to the learner. Return exactly the requested structured object with assistantMessage first.`;

export const runReviewPresentationAgent = ({
  messages,
  context,
  experience,
  reviewStage,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  experience: EducationExperienceDefinition;
  reviewStage: "review" | "recall";
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: ReviewPresentationOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "reviewer",
    purpose: "evaluation",
    system: REVIEWER_SYSTEM,
    messages,
    context: `## Experience behavior\n${experience.reviewer.instructions}\n\n${context}\n\n## This turn: open adversarial review\nPresent the first independent pressure test. Test the capability dimensions on a novel surface and begin satisfying the reviewer todos. assistantMessage must contain only the complete learner-facing challenge. Author its exact private contract and calibrated difficulty vector in the dedicated fields. Set contract.scenarioStage to ${reviewStage}.`,
    schema: ReviewPresentationOutputSchema,
    schemaName: "unit_review_presentation",
    maxOutputTokens: 3_000,
    errorMessage: "Failed to open the adversarial review.",
    onPartialAssistantMessage,
  });

export const runReviewGradeAgent = ({
  messages,
  context,
  activeChallenge,
  experience,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  activeChallenge: UnitReviewChallenge;
  experience: EducationExperienceDefinition;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: ReviewGradeOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "reviewer",
    purpose: "evaluation",
    system: REVIEWER_SYSTEM,
    messages,
    context: `## Experience behavior\n${experience.reviewer.instructions}\n\n${context}\n\n## Immutable active challenge\n${JSON.stringify(activeChallenge)}\n\n## This turn: grade and push\nGrade the learner's latest answer only against the immutable active challenge. Return one result for every capability dimension tested by its contract. Mark reviewer todos complete only with concrete evidence. If every capability and reviewer todo is robust, pass. Otherwise continue: assistantMessage must include concise direct feedback followed by the complete next challenge, and nextChallenge must privately define that exact new challenge with the same scenarioStage as the active challenge.`,
    schema: ReviewGradeOutputSchema,
    schemaName: "unit_review_grade",
    maxOutputTokens: 3_600,
    errorMessage: "Failed to grade the adversarial review.",
    onPartialAssistantMessage,
  });
