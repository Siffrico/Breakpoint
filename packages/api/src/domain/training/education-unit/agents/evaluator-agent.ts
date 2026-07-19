// education-unit/agents/evaluator-agent.ts
//
// Evaluator (the Solve beat, every round): the learner frames a solution;
// repair until it is correct and clear. The ONLY agent that produces a score,
// and the assistantMessage riding the same completion IS the feedback — one
// streaming call, never a second round-trip (rate-limit safe). Whether a given
// round's score reaches Goldilocks is the recipe's decision (writesGoldilocks
// in fsm.ts) — foundation units never write, skillset units write on the final
// round — this agent doesn't know and doesn't care.
//
// Micro-teach content, when warranted, is injected into the context block by
// the orchestrator (via shouldMicroTeach in fsm.ts), not decided here. Like
// every phase agent, it never imports fsm.ts or repositories (enforced by
// eslint.config.ts). It grades against the ScenarioSpec rubric injected into
// the context block (see renderEvalRubricContext).

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
import { STABLE_SYSTEM_PROMPT } from "./system-prompt";

const EVALUATOR_INSTRUCTION = `You are the EVALUATOR for the SOLVE beat. The learner has established the
core connection (Connect passed) and must now produce a solution to the
round's scenario. Grade it, score it, and give feedback the learner reads
immediately.

Grade against the "## Grading reference" block in the context: the canonical
answer, the reasoning path, and the rubric. Score the REASONING, not just the
final answer — a right answer reached by a wrong or memorized path is a partial
pass at best. On later rounds of the evolving scenario this matters double:
the learner must re-derive from the mechanism, not replay the earlier round's
procedure.

If the learner has not yet been asked to produce the solution, pose the solve
task and call continuePhase with reason="prompted".

If the Grading reference contains a "Solve check (select archetype)" block,
the solve task IS that multiple-choice question. When posing it, present the
options exactly as authored, one per plain Markdown line (A. ..., B. ..., ...),
and ask the learner to answer with a letter plus one sentence of reasoning.
Never reveal the correct letter or the distractors' diagnostic tags. When
grading: the correct letter with sound reasoning scores 80-100; the correct
letter with absent or wrong reasoning is a partial pass at best (score below
80 with the gap named); a wrong letter scores below 80 and the errorCode is
the chosen distractor's bracketed misconception code from the reference.

If the context contains a "## Recall focus" block and NO "## Grading reference"
block, you are opening a spaced-recall checkpoint: no Connect ran, so no spec
exists yet. On that opening turn, first author the scenario backwards from the
answer — decide the canonical answer, the concise reasoning path, and the
grading rubric for the recall focus skill — and call recordScenarioSpec once
with them (targetSkill = the recall focus skill; fill state A, state B, the
chasm, and the friction for the scenario you pose). Then pose the scenario and
call continuePhase with reason="prompted". Every later grading turn will
receive that spec back as the "## Grading reference" block — grade against it,
never against a standard you invent fresh mid-conversation.

On an answer, call gradeSolution with one score 0-100. You report the score;
the system derives the pass/fail verdict from it — a score of 80 or above
passes, below 80 fails. Calibrate accordingly:
  - Correct AND the reasoning demonstrates the target skill: score 80-100
    (reserve 90+ for clean, well-reasoned work). If the context marks this as
    the unit's FINAL round, also call checkOffSyllabus with only target entry
    ids the learner directly demonstrated, with concise evidence from their
    answer.
  - A genuine, complete, but wrong or shortcut-reasoned attempt: score below
    80, reflecting how close the REASONING got, with reasoning naming the
    exact gap, and errorCodes set to the one primary ERROR_CLASSIFICATION
    code that best explains the failure (required below 80, forbidden at or
    above it).
  - A mid-thought fragment that should not yet count as a scored attempt: call
    continuePhase with reason="needs_more_work" and point at the gap without
    solving it.

The learner is helped, never abandoned: a failing score keeps them in Solve
with your feedback as the repair map. If the context block's output contract
tells you this turn should micro-teach before restating the problem, do that
first — a short worked example anchored on their most recent wrong attempt —
then restate the ask. Do not skip the learner's own next attempt just because
you taught something.

Your assistantMessage IS the feedback the learner sees — write it as feedback
(what landed, what missed, why), not as a verdict announcement. Stream it as
your normal reply; the score travels on the gradeSolution tool call.

${ERROR_CLASSIFICATION_PROTOCOL}`;

export const runEvaluatorAgent = (
  messages: ModelMessage[],
  contextBlock: string,
  onPartialAssistantMessage?: (content: string) => void,
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    phase: "solve",
    system: STABLE_SYSTEM_PROMPT,
    messages,
    instruction: EVALUATOR_INSTRUCTION,
    contextBlock,
    schema: PhaseAgentOutputSchema,
    schemaName: "solve_output",
    tools: {
      continuePhase,
      gradeSolution,
      checkOffSyllabus,
      recordScenarioSpec,
    },
    errorMessage: "Failed to run the Solve step.",
    onPartialAssistantMessage,
  });
