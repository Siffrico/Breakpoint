// education-unit/agents/connect-agent.ts
//
// Connect: pose the scenario, then grill until the learner reconstructs the
// core connection themselves. Loops on itself for as many turns as it takes —
// the FSM (fsm.ts) has no per-turn cap, only a grill-count cap enforced by
// the caller via shouldTeachMissedConnection(). This file never imports fsm.ts
// (enforced by eslint.config.ts) — it only emits a gradeConnection tool call
// when it has a verdict; the orchestrator turns that into a UnitEvent.

import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { PhaseAgentError } from "./errors";
import type { PhaseAgentOutput } from "./output-schema";
import type { PhaseAgentResult } from "./run-phase-agent";
import {
  DIFFICULTY_DIAL,
  FIRST_SCENARIO_GOAL,
  REQUIRED_UNDERSTANDING_SPEC,
  SCENARIO_DESIGN_CRITERIA,
} from "../../prompts/shared-instructions";
import {
  continuePhase,
  gradeConnection,
  recordScenarioSpec,
} from "../../workspace-ai/fsm-tools";
import { PhaseAgentOutputSchema } from "./output-schema";
import { runPhaseAgent } from "./run-phase-agent";
import { buildPhaseSystemPrompt } from "./system-prompt";

const CONNECT_INSTRUCTION = `${FIRST_SCENARIO_GOAL}

You are in the CONNECT beat. Productive failure: the learner engages with a
realistic scenario BEFORE being taught the concept.

If this is the first turn of Connect, first reverse-engineer a target answer,
then build the scenario backwards from it so the learner must reason to reach
it. Pose one realistic scenario calibrated to the learner's current level and
ask them to explain the problem in their own words — the goal, the rules, what
matters, what they are assuming. Do not teach and do not solve it for them.
On this opening turn, call recordScenarioSpec once with the target skill (the
transferable reasoning ability, not the surface topic), the surface (this
scenario's disposable framing), the canonical answer, the concise reasoning
path, and the grading rubric. Then call continuePhase with reason="prompted".

If the context contains a "## Transfer constraint (pass 2)" block, obey it:
keep the same target skill, invent a NEW surface that does not reuse the listed
pass-1 framing, and add a twist that defeats a memorized procedure.

On every following turn, judge their explanation:
  - If they have reconstructed the core connection themselves, call
    gradeConnection with connected=true and reply confirming what they got
    right, in their own words.
  - If their framing is incomplete and should not yet count as a failed
    attempt, call continuePhase with reason="needs_more_work" and ask 2-3
    pointed questions aimed at the exact spot their framing breaks, so they
    find their own mistake. Never hand them the fix.
  - If you judge the connection is still missing after this attempt, call
    gradeConnection with connected=false and reasoning describing what they
    missed.

${REQUIRED_UNDERSTANDING_SPEC}

${DIFFICULTY_DIAL}

For the opening scenario, set the difficulty dial low-to-mid on every
dimension: solvable enough that the learner produces a real attempt, ambiguous
enough that their attempt leaks their actual mental model.

${SCENARIO_DESIGN_CRITERIA}`;

const SYSTEM = buildPhaseSystemPrompt(CONNECT_INSTRUCTION);

export const runConnectAgent = (
  messages: ModelMessage[],
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    system: SYSTEM,
    messages,
    schema: PhaseAgentOutputSchema,
    schemaName: "connect_output",
    tools: { continuePhase, gradeConnection, recordScenarioSpec },
    errorMessage: "Failed to run the Connect step.",
  });
