import type { ModelMessage } from "ai";
import { Duration, Effect, Schedule } from "effect";

import type { UnitReviewChallenge, UnitReviewPass } from "@acme/validators";

import type {
  GradeShape,
  ReviewGradeOutput,
  ReviewPresentationOutput,
} from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import { invokeTextModel } from "../engine/invoke-structured-model";
import { requireAiModelForPurpose } from "../engine/model-router";
import {
  PASSING_COMPOSITE,
  PASSING_DIMENSION,
  reviewGradeSchema,
} from "./agent-contracts";
import {
  classifyUnitAgentFailure,
  isRetryableUnitAgentError,
} from "./agent-errors";
import { runUnitAgent } from "./run-unit-agent";

const CRITIC_SYSTEM = `You are Breakpoint's independent critic. You grade, but grading is the smaller half of the job: you exist to show a learner the exact place their mental model diverged from an expert's, in words they can feel.

You run on a fresh window. You see the transcript, the mastery contract, and the expert workflow — nothing about how the learner got here and nothing about what answer was intended. Judge only what is on the page.

## How you read an answer
Reconstruct the move sequence an expert would actually run for this scenario, using the expert workflow as the spine. Lay the learner's move sequence beside it. Walk both until they split. That first split is the whole finding — everything downstream of it is a symptom, not the cause.

Almost every miss is one missing high-level idea, not a missing fact. Name it as a statement about how they are thinking, in plain language: "you're treating the benchmark as the goal when it's a proxy the system can learn to attack." Not "you failed to consider reward hacking." The learner should read one sentence and recognize themselves in it.

## How you write it
Lead with the divergence, in their own frame. Quote their actual words back so the finding is anchored, then show the expert's move at that same fork and why it follows. Keep it short and concrete — insight per sentence is the metric, not coverage. Never enumerate a rubric, never list every dimension, never narrate what they got right at length. No scores, no rubrics, no dimension names, no mention of passes, agents, contracts, or Goldilocks.

When the scores show no real gap, do not manufacture one. Close cleanly and say what now holds.

## Evidence
Every dimension's evidence field must be a verbatim quote from the learner's latest answer — their characters, not your paraphrase. Fluent language without the mechanism is a failure signal, not a passing one. Difficulty comes from realistic constraints, ambiguity, and competing plausible alternatives; never from trivia, withheld information a practitioner would have, or contrived rules.

Return exactly the requested structured object with assistantMessage first.`;

const presentationTurnInstruction = (pass: UnitReviewPass) =>
  pass === 1
    ? `## This turn: open the review
Present one whole realistic challenge on a surface the mentor never used. It must require the capability itself, not recall of the lesson. assistantMessage contains only the learner-facing challenge — no preamble about what you are doing. The server owns the private evaluation contract; do not emit a rubric, scores, or metadata.`
    : `## This turn: open the transfer check
The learner already repaired their gap under guidance. This is the unaided check that it transferred. Present one fresh whole scenario on ground they have not seen, in a different domain or framing from anything earlier in this unit. Minimal guidance: no hints, no scaffolding, no reference to what they just fixed, no callback to the earlier challenge. It should read as a new problem, not as a retest. assistantMessage contains only the challenge.`;

export const runReviewPresentationAgent = ({
  messages,
  context,
  experience,
  pass,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  experience: EducationExperienceDefinition;
  pass: UnitReviewPass;
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: ReviewPresentationOutput }, UnitAgentError> => {
  const attempt = Effect.tryPromise({
    try: async (signal) => {
      const result = invokeTextModel({
        model: requireAiModelForPurpose(
          "evaluation",
          "Failed to open the adversarial review.",
        ),
        system: `${CRITIC_SYSTEM}\n\n## Customized behavior\n${experience.reviewer.instructions}`,
        prompt: [
          ...messages,
          {
            role: "user",
            content: `${context}\n\n${presentationTurnInstruction(pass)}`,
          },
        ],
        cache: true,
        maxOutputTokens: 3_000,
        reasoning: "low",
        abortSignal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
      });
      let assistantMessage = "";
      for await (const delta of result.textStream) {
        assistantMessage += delta;
        onPartialAssistantMessage?.(assistantMessage);
      }
      assistantMessage = assistantMessage.trim();
      if (!assistantMessage) {
        throw new Error("The reviewer returned an empty challenge.");
      }
      return { object: { assistantMessage } };
    },
    catch: classifyUnitAgentFailure,
  });

  return Effect.retry(attempt, {
    schedule: Schedule.exponential(Duration.millis(200), 2).pipe(
      Schedule.both(Schedule.recurs(1)),
    ),
    while: isRetryableUnitAgentError,
  });
};

const gradeTurnInstruction = (decisive: boolean) => {
  const task = decisive
    ? `## This turn: the unaided check
Grade the learner's latest answer against the immutable active challenge. This attempt decides the unit: clean scores end it, a gap opens another fresh scenario. Say plainly where they landed and why.`
    : `## This turn: the warm-up
Grade the learner's latest answer against the immutable active challenge. This attempt cannot end the unit — an unaided check follows either way. So teach through the miss: name the first mental-model divergence and repair it in words, close enough that they walk into the next scenario carrying the idea. Never say the words pass, fail, warm-up, or next pass.`;

  return `${task}

## Score scale
Every dimension score is an integer percentage from 0 to 100, never a 1-3 ordinal. A pass requires a composite score of at least ${PASSING_COMPOSITE} and every dimension at least ${PASSING_DIMENSION}. Make the scores, errorCodes, and learner-facing conclusion agree.`;
};

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
    reasoning: shape.decisive ? "medium" : "low",
    system: `${CRITIC_SYSTEM}\n\n## Customized behavior\n${experience.reviewer.instructions}`,
    messages,
    context: `${context}\n\n## Immutable active challenge\n${JSON.stringify(activeChallenge)}\n\n${gradeTurnInstruction(shape.decisive)}`,
    schema: reviewGradeSchema(shape),
    schemaName: "unit_review_grade",
    maxOutputTokens: 3_600,
    errorMessage: "Failed to grade the adversarial review.",
    onPartialAssistantMessage,
  });
