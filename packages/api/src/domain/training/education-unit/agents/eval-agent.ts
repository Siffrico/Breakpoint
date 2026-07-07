// education-unit/agents/eval-agent.ts
//
// Eval: the pass-2 Solve grader. This is the ONLY agent that produces a score
// that reaches Goldilocks, and it runs only on pass 2 (pass 1's Solve is graded
// inline by the scenario/solve agent — formative, no rating).
//
// It is a single streaming call, not two: the learner-facing feedback streams
// as `assistantMessage` while the score rides out on the `gradeSolution` tool
// call in the same completion. So the learner never waits for a second model
// round-trip, and we never fan out beyond one call per turn (rate-limit safe).
// The orchestrator reads the tool call's score and hands it to Goldilocks after
// the stream closes — see runUnitTurn's ratingWrite.
//
// Like every phase agent, it never imports fsm.ts or repositories (enforced by
// eslint.config.ts). It grades against the ScenarioSpec rubric injected into the
// context block by the orchestrator (see renderEvalRubricContext).

import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { PhaseAgentError } from "./errors";
import type { PhaseAgentOutput } from "./output-schema";
import type { PhaseAgentResult } from "./run-phase-agent";
import { ERROR_CLASSIFICATION_PROTOCOL } from "../../prompts/shared-instructions";
import {
  continuePhase,
  gradeSolution,
  recordScenarioSpec,
} from "../../workspace-ai/fsm-tools";
import { checkOffSyllabus } from "./check-off-syllabus.tool";
import { PhaseAgentOutputSchema } from "./output-schema";
import { runPhaseAgent } from "./run-phase-agent";
import { buildPhaseSystemPrompt } from "./system-prompt";

const EVAL_INSTRUCTION = `You are the EVAL agent for the SECOND (transfer) pass of this unit. The
learner has already been taught the concept once and is now solving a new
scenario on a fresh surface. Your job is to grade their transfer, score it,
and give feedback the learner reads immediately.

Grade against the "## Grading reference" block in the context: the canonical
answer, the reasoning path, and the rubric. Score the REASONING, not just the
final answer — a right answer reached by a wrong or memorized path is a partial
pass at best, because this pass exists to prove transfer of the skill.

If the learner has not yet been asked to produce the transfer solution, pose it
and call continuePhase with reason="prompted".

If the context contains a "## Recall focus" block and NO "## Grading reference"
block, you are opening a spaced-recall checkpoint: no Connect ran, so no spec
exists yet. On that opening turn, first reverse-engineer the scenario from the
answer outward — decide the canonical answer, the concise reasoning path, and
the grading rubric for the recall focus skill — and call recordScenarioSpec
once with them (targetSkill = the recall focus skill, surface = this scenario's
disposable framing). Then pose the scenario and call continuePhase with
reason="prompted". Every later grading turn will receive that spec back as the
"## Grading reference" block — grade against it, never against a standard you
invent fresh mid-conversation.

On an answer:
  - Correct AND the reasoning demonstrates the target skill: call gradeSolution
    with passed=true and a score 80-100 (reserve 90+ for clean, well-reasoned
    transfer). Also call checkOffSyllabus with only target entry ids the learner
    directly demonstrated, with concise evidence from their answer.
  - A genuine, complete, but wrong or shortcut-reasoned attempt: call
    gradeSolution with passed=false and a score reflecting how close the
    REASONING got, with reasoning naming the exact gap, and errorCodes set to
    the primary ERROR_CLASSIFICATION code that best explains the failure.
  - A mid-thought fragment that should not yet count as a scored attempt: call
    continuePhase with reason="needs_more_work" and point at the gap without
    solving it.

Your assistantMessage IS the feedback the learner sees — write it as feedback
(what landed, what missed, why), not as a verdict announcement. Stream it as
your normal reply; the score travels on the gradeSolution tool call.

${ERROR_CLASSIFICATION_PROTOCOL}`;

const SYSTEM = buildPhaseSystemPrompt(EVAL_INSTRUCTION);

export const runEvalAgent = (
  messages: ModelMessage[],
  onPartialAssistantMessage?: (content: string) => void,
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    phase: "solve",
    system: SYSTEM,
    messages,
    schema: PhaseAgentOutputSchema,
    schemaName: "eval_output",
    tools: {
      continuePhase,
      gradeSolution,
      checkOffSyllabus,
      recordScenarioSpec,
    },
    errorMessage: "Failed to run the Eval step.",
    onPartialAssistantMessage,
  });
