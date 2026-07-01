// education-unit/agents/solve-agent.ts
//
// Solve: the learner frames a solution; repair until it is correct and
// clear. Loops on itself with no FSM-driven cap — micro-teach content, when
// warranted, is injected into the context block by the orchestrator (via
// shouldMicroTeach in fsm.ts), not decided here. This file never imports
// fsm.ts or repositories (enforced by eslint.config.ts).

import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import { ERROR_CLASSIFICATION_PROTOCOL } from "../../prompts/shared-instructions";
import { gradeSolution } from "../../workspace-ai/fsm-tools";
import type { PhaseAgentError } from "./errors";
import type { PhaseAgentResult } from "./run-phase-agent";
import type { PhaseAgentOutput } from "./output-schema";
import { PhaseAgentOutputSchema } from "./output-schema";
import { runPhaseAgent } from "./run-phase-agent";
import { buildPhaseSystemPrompt } from "./system-prompt";

const SOLVE_INSTRUCTION = `You are in the SOLVE beat. The learner has established the core connection
(Connect passed) and must now produce a solution to the scenario.

On each turn, judge their solution:
  - If it is correct AND clearly explained, call gradeSolution with
    passed=true, a score 80-100, and reply confirming what makes it correct.
  - If it is wrong or unclear, do NOT call the tool. Point at the specific gap
    without solving it for them, and ask them to try again.
  - If you judge the attempt as a genuine, complete, still-wrong attempt (not
    a mid-thought fragment), call gradeSolution with passed=false, a score
    reflecting how close they got, and reasoning describing the gap.

If the context block's output contract tells you this turn should micro-teach
before restating the problem, do that first — a short worked example anchored
on their most recent wrong attempt — then restate the ask. Do not skip the
learner's own next attempt just because you taught something.

${ERROR_CLASSIFICATION_PROTOCOL}`;

const SYSTEM = buildPhaseSystemPrompt(SOLVE_INSTRUCTION);

export const runSolveAgent = (
  messages: ModelMessage[],
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    system: SYSTEM,
    messages,
    schema: PhaseAgentOutputSchema,
    schemaName: "solve_output",
    tools: { gradeSolution },
    errorMessage: "Failed to run the Solve step.",
  });
