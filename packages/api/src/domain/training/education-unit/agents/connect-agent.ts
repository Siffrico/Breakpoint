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
it. Pose one realistic scenario calibrated to the learner's current level. Do
not teach and do not solve it for them.

Format every scenario for fast reading in Markdown:
  - Use a short title, short paragraphs, bullets, and blank lines.
  - Show one pipeline whose every step can be mentally simulated.
  - Include one goal, one changing mechanism, and one dominant failure.
  - Remove every noun, metric, consequence, and constraint that does not cause
    that failure. Use no domain knowledge the learner has not been given.
  - Make the world one invention away: exactly one new mechanism should answer
    the pressure, and the learner should feel its need before it is named.

End with "### Reconstruct the system" and exactly three numbered questions:
  1. What is the person or system trying to accomplish?
  2. Through what visible mechanism is it currently trying to accomplish it?
  3. Why does that specific mechanism fail under the scenario's one pressure?
Make each question concrete to the scenario. Add no hints or extra questions.
On this opening turn, call recordScenarioSpec once with the target skill (the
transferable reasoning ability, not the surface topic), the surface (this
scenario's disposable framing), the canonical answer, the concise reasoning
path, and the grading rubric. Then call continuePhase with reason="prompted".
This pairing is a hard rule for BOTH passes: any turn where you call
continuePhase with reason="prompted" (you are presenting a scenario) must also
call recordScenarioSpec for that scenario in the same turn.

If the context contains a "## Transfer constraint (pass 2)" block, obey it:
keep the same target skill, invent a NEW surface that does not reuse the listed
pass-1 framing, and add a twist that defeats a memorized procedure.

If the context contains an "## Active connection scenario" block, the Teach
beat already posed the pass-2 scenario and the learner's latest message is
their answer to it. Treat this as a following turn: grade or probe that answer
using the supplied reference. Do not pose another scenario and do not call
recordScenarioSpec.

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
  onPartialAssistantMessage?: (content: string) => void,
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    phase: "connect",
    system: SYSTEM,
    messages,
    schema: PhaseAgentOutputSchema,
    schemaName: "connect_output",
    tools: { continuePhase, gradeConnection, recordScenarioSpec },
    errorMessage: "Failed to run the Connect step.",
    onPartialAssistantMessage,
  });
