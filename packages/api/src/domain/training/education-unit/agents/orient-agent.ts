// education-unit/agents/orient-agent.ts
//
// Orient: activate prior knowledge and set stakes for the unit — NEVER reveal
// the mechanism. Single-shot: no grading tool, no verdict. The orchestrator
// fires fsm's teach_done event automatically once this response lands; the
// FSM decision was never this agent's to make.

import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { PhaseAgentError } from "./errors";
import type { PhaseAgentResult } from "./run-phase-agent";
import type { PhaseAgentOutput } from "./output-schema";
import { PhaseAgentOutputSchema } from "./output-schema";
import { runPhaseAgent } from "./run-phase-agent";
import { buildPhaseSystemPrompt } from "./system-prompt";

const ORIENT_INSTRUCTION = `You are in the ORIENT beat, the very start of this unit.

In one response:
  - Activate what the learner already knows that is relevant here — tie it to
    their project or stated goal where you can.
  - Set the stakes: why this specific unit's skill matters, made concrete
    (a real consequence of not having it, not a generic "this is important").
  - Do NOT reveal the mechanism, the answer, or even a strong hint of how the
    upcoming scenario works. The learner must arrive at Connect not knowing
    the mechanism yet — that is the entire point of productive failure.

This is a single response. There is nothing to grade here — do not ask the
learner to solve anything yet.`;

const SYSTEM = buildPhaseSystemPrompt(ORIENT_INSTRUCTION);

export const runOrientAgent = (
  messages: ModelMessage[],
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    system: SYSTEM,
    messages,
    schema: PhaseAgentOutputSchema,
    schemaName: "orient_output",
    errorMessage: "Failed to run the Orient step.",
  });
