import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type {
  EvaluationDimensionResult,
  UnitReviewChallenge,
} from "@acme/validators";

import type {
  GradeShape,
  ReviewFeedbackOutput,
  ReviewGradeOutput,
} from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import {
  PASSING_COMPOSITE,
  PASSING_DIMENSION,
  reviewFeedbackSchema,
  reviewGradeSchema,
} from "./agent-contracts";
import { runUnitAgent } from "./run-unit-agent";

const CRITIC_SYSTEM = `You are Breakpoint's independent critic. You grade, but grading is the smaller half of the job: you exist to show a learner the exact place their mental model diverged from an expert's, in words they can feel.

You run on a fresh window. You see the active challenge with its private verifier, the learner's latest answer, the unit's judgment standard, and the expert workflow. Treat the verifier as the authoritative intended solution or checking rule, apply the judgment criteria to the learner's reasoning, and never quote or reveal private verifier data. Judge only that evidence.

## How you read an answer
Reconstruct the move sequence an expert would actually run for this scenario, using the expert workflow as the spine. Lay the learner's move sequence beside it. Walk both until they split. That first split is the whole finding — everything downstream of it is a symptom, not the cause.

Almost every miss is one missing high-level idea, not a missing fact. Name it as a statement about how they are thinking, in plain language: "you're treating the benchmark as the goal when it's a proxy the system can learn to attack." Not "you failed to consider reward hacking." The learner should read one sentence and recognize themselves in it.

## How you write it
Lead with the divergence, in their own frame. Quote their actual words back so the finding is anchored, then show the expert's move at that same fork and why it follows. Keep it short and concrete — insight per sentence is the metric, not coverage. Never enumerate a rubric, never list every dimension, never narrate what they got right at length. No scores, no rubrics, no dimension names, no mention of passes, agents, contracts, or Goldilocks.

When the scores show no real gap, do not manufacture one. Close cleanly and say what now holds.

## Evidence
Every criterion's evidence field must be a verbatim quote from the learner's latest answer — their characters, not your paraphrase. Fluent language without the mechanism is a failure signal, not a passing one. Difficulty comes from realistic constraints, ambiguity, and competing plausible alternatives; never from trivia, withheld information a practitioner would have, or contrived rules.

Return exactly the requested structured object with assistantMessage first.`;

const gradeTurnInstruction = (
  interactiveFeedback: boolean,
) => `## This turn: the unaided check
Grade the learner's latest answer against the immutable active challenge. A clean answer closes this pass immediately. ${interactiveFeedback ? "A real gap starts a short feedback exchange: name only the first mental-model divergence, repair it closely, and end with one small question that lets the learner show the repair landed." : "This is a one-shot checkpoint: if there is a real gap, name only the first mental-model divergence, give the smallest useful repair, and close without a question."} Never say the words pass, fail, or next pass.

## Score scale
Every criterion score is an integer percentage from 0 to 100, never a 1-3 ordinal. A pass requires a composite score of at least ${PASSING_COMPOSITE} and every criterion at least ${PASSING_DIMENSION}. Make the scores, errorCodes, and learner-facing conclusion agree.`;

const cognitiveDiagnosisPolicy = (
  interactiveFeedback: boolean,
) => `## This grading turn: cognitive diagnosis and JIT repair
Scores and rubric evidence are private control data. The learner-facing response is not a report card. Its job is to reconstruct why the learner's move felt correct, locate the first hidden assumption that made it diverge from the expert workflow, and supply only the smallest fragment needed to rethink that move.

When the answer has a real gap, write one private scratchpad of at most 500 characters before finalizing assistantMessage:
1. Identify what the learner was sensibly optimizing for or protecting.
2. State the hidden assumption that made their choice locally logical.
3. Classify the first cause as constraint blindness, a misapplied heuristic, or a missing prerequisite. Diagnose the cause, not its downstream symptoms.
4. Choose one JIT intervention: the minimum mental model, rule, procedural cue, or syntax fragment that breaks that assumption. Do not teach the surrounding topic.

When the answer has a real gap, write assistantMessage in this compact semantic order, using the learner's vocabulary:

**What held**
One sentence acknowledging the sound part of their reasoning.

**Change**
Name the first hidden assumption and show why it breaks on this scenario.

**Use next time**
${interactiveFeedback ? "Give the minimum reusable cue in one or two sentences, then ask one small question that checks the repaired idea without becoming another full scenario." : "Give the minimum reusable cue in one or two sentences and close without a question."}

Avoid clinical or academic diagnostic language when plain words work. Do not use headings named Mirror, Pivot, Crucible, Diagnosis, or JIT. Do not mention scores, grading, rubrics, dimensions, agents, passes, or scratchpads.

When there is no real gap, keep the scratchpad to one short statement that no material divergence exists. Write one short paragraph confirming the answer and naming the decisive evidence. Do not use the repair sections, invent a flaw, ask a remedial question, or promise another task. When there is a gap, do not imply that one explanation completes the capability: the server will continue presenting fresh scenarios until the learner demonstrates the repaired model independently.`;

const feedbackTurnInstruction = (
  promptRound: number,
) => `## This turn: feedback check ${promptRound} of 3
The scenario grade is already final and cannot change. Read the learner's latest reply to your feedback question and decide only whether the specific diagnosed gap has now been understood.

If it has landed, set feedbackComplete=true, confirm the corrected idea briefly, and ask no question. If it has not landed and this is before check 3, set feedbackComplete=false, correct only the remaining mismatch, and end with exactly one smaller question. On check 3, set feedbackComplete=true and close honestly without claiming understanding that was not shown. Never mention the grade, pass numbers, prompt limits, internal state, or Goldilocks.`;

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
    reasoning: "high",
    system: `${CRITIC_SYSTEM}\n\n${cognitiveDiagnosisPolicy(shape.interactiveFeedback)}\n\n## Customized behavior\n${experience.reviewer.instructions}`,
    messages,
    context: `${context}\n\n## Immutable active challenge and private verifier\n${JSON.stringify(activeChallenge)}\n\n${gradeTurnInstruction(shape.interactiveFeedback)}`,
    schema: reviewGradeSchema(shape),
    schemaName: "unit_review_grade",
    maxOutputTokens: 6_000,
    reasoningBudgetTokens: 3_000,
    temperature: 0.2,
    errorMessage: "Failed to grade the adversarial review.",
    onPartialAssistantMessage,
  });

export const runReviewFeedbackAgent = ({
  messages,
  context,
  experience,
  promptRound,
  errorCodes,
  dimensionResults,
  onPartialAssistantMessage,
}: {
  messages: readonly ModelMessage[];
  context: string;
  experience: EducationExperienceDefinition;
  promptRound: number;
  errorCodes: readonly string[];
  dimensionResults: readonly EvaluationDimensionResult[];
  onPartialAssistantMessage?: (content: string) => void;
}): Effect.Effect<{ object: ReviewFeedbackOutput }, UnitAgentError> =>
  runUnitAgent({
    agent: "reviewer",
    purpose: "evaluation",
    reasoning: "high",
    system: `${CRITIC_SYSTEM}\n\n## Customized behavior\n${experience.reviewer.instructions}`,
    messages,
    context: `${context}\n\n## Frozen scenario diagnosis\n${JSON.stringify({ errorCodes, dimensionResults })}\n\n${feedbackTurnInstruction(promptRound)}`,
    schema: reviewFeedbackSchema(promptRound),
    schemaName: "unit_review_feedback",
    maxOutputTokens: 3_000,
    reasoningBudgetTokens: 1_400,
    temperature: 0.2,
    errorMessage: "Failed to continue the learner feedback.",
    onPartialAssistantMessage,
  });
