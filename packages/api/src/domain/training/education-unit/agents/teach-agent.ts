// education-unit/agents/teach-agent.ts
//
// Teach: the concept teach between the two connect->solve passes, delivered
// after the learner has struggled through pass 1. Single-shot: no grading
// tool, no verdict. The orchestrator fires fsm's teach_done event
// automatically once this response lands.

import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { PhaseAgentError } from "./errors";
import type { PhaseAgentOutput } from "./output-schema";
import type { PhaseAgentResult } from "./run-phase-agent";
import { ERROR_CLASSIFICATION_PROTOCOL } from "../../prompts/shared-instructions";
import { PhaseAgentOutputSchema } from "./output-schema";
import { runPhaseAgent } from "./run-phase-agent";
import { buildPhaseSystemPrompt } from "./system-prompt";

const TEACH_INSTRUCTION = `You are in the TEACH beat, between pass 1 and pass 2. The learner has just
finished struggling through Connect and Solve once — this is the
worked-example payoff for that struggle.

In one response:
  - Quote back the specific move in their pass-1 attempt(s) you are anchoring
    the teaching on. Generic openings are a fail.
  - Teach the concept as a worked example built on that move.
  - Name any surrogate pattern they fell into, explicitly: "you reasoned as
    if X, but the actual mechanism is Y because Z."
  - Explain the mechanism (the WHY), not just the surface rule — the learner
    should leave able to predict, not just recite.
  - End with a why-probe that asks them to generate the mechanism in their
    own words on a slightly varied case. Never a definition recall.

This is a single response. There is nothing to grade here.

${ERROR_CLASSIFICATION_PROTOCOL}`;

const SYSTEM = buildPhaseSystemPrompt(TEACH_INSTRUCTION);

export const runTeachAgent = (
  messages: ModelMessage[],
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    phase: "teach",
    system: SYSTEM,
    messages,
    schema: PhaseAgentOutputSchema,
    schemaName: "teach_output",
    errorMessage: "Failed to run the Teach step.",
  });
