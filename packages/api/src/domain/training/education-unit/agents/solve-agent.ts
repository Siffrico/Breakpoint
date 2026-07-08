// education-unit/agents/solve-agent.ts
//
// Solve: the learner frames a solution; repair until it is correct and
// clear. Loops on itself with no FSM-driven cap — micro-teach content, when
// warranted, is injected into the context block by the orchestrator (via
// shouldMicroTeach in fsm.ts), not decided here. This file never imports
// fsm.ts or repositories (enforced by eslint.config.ts).

import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { PhaseAgentError } from "./errors";
import type { PhaseAgentOutput } from "./output-schema";
import type { PhaseAgentResult } from "./run-phase-agent";
import { ERROR_CLASSIFICATION_PROTOCOL } from "../../prompts/shared-instructions";
import { continuePhase, gradeSolution } from "../../workspace-ai/fsm-tools";
import { checkOffSyllabus } from "./check-off-syllabus.tool";
import { PhaseAgentOutputSchema } from "./output-schema";
import { runPhaseAgent } from "./run-phase-agent";
import { buildPhaseSystemPrompt } from "./system-prompt";

const SOLVE_INSTRUCTION = `You are in the SOLVE beat. The learner has established the core connection
(Connect passed) and must now produce a solution to the scenario.

If the learner has not yet been asked to produce the solution, pose the solve
task and call continuePhase with reason="prompted".

On each answer, judge their solution and report one gradeSolution score 0-100.
You report the score; the system derives the pass/fail verdict from it — 80 or
above passes, below 80 fails. Calibrate accordingly:
  - If it is correct AND clearly explained, score 80-100 and reply confirming
    what makes it correct. On pass 2, also call checkOffSyllabus with only
    target entry ids directly demonstrated by the learner and concise evidence
    from their answer.
  - If it is incomplete or unclear and should not yet count as a failed
    attempt, call continuePhase with reason="needs_more_work" instead of
    grading. Point at the specific gap without solving it for them, and ask
    them to try again.
  - If you judge the attempt as a genuine, complete, still-wrong attempt (not
    a mid-thought fragment), score below 80, reflecting how close they got,
    with reasoning describing the gap and errorCodes set to the one primary
    ERROR_CLASSIFICATION code (required below 80, forbidden at or above it).

If the context block's output contract tells you this turn should micro-teach
before restating the problem, do that first — a short worked example anchored
on their most recent wrong attempt — then restate the ask. Do not skip the
learner's own next attempt just because you taught something.

${ERROR_CLASSIFICATION_PROTOCOL}`;

const SYSTEM = buildPhaseSystemPrompt(SOLVE_INSTRUCTION);

export const runSolveAgent = (
  messages: ModelMessage[],
  onPartialAssistantMessage?: (content: string) => void,
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    phase: "solve",
    system: SYSTEM,
    messages,
    schema: PhaseAgentOutputSchema,
    schemaName: "solve_output",
    tools: { continuePhase, gradeSolution, checkOffSyllabus },
    errorMessage: "Failed to run the Solve step.",
    onPartialAssistantMessage,
  });
