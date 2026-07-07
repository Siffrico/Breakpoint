// education-unit/agents/teach-agent.ts
//
// Teach: the concept teach between the two connect->solve passes, delivered
// after the learner has struggled through pass 1. Single-shot: no grading
// verdict. It records the pass-2 scenario carried by its final why-probe, and
// the orchestrator fires fsm's teach_done event automatically once this
// response lands.

import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { PhaseAgentError } from "./errors";
import type { PhaseAgentOutput } from "./output-schema";
import type { PhaseAgentResult } from "./run-phase-agent";
import { ERROR_CLASSIFICATION_PROTOCOL } from "../../prompts/shared-instructions";
import { recordScenarioSpec } from "../../workspace-ai/fsm-tools";
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

The why-probe IS the pass-2 Connect scenario. Reverse-engineer its target
answer before writing it, vary the pass-1 surface, and add a twist that defeats
mere repetition. Call recordScenarioSpec exactly once with the probe's target
skill, new surface, canonical answer, concise reasoning path, and grading
rubric. The learner's next message will be graded against this spec; do not add
a second scenario or ask whether they understand.

This is a single response. There is nothing to grade yet.

${ERROR_CLASSIFICATION_PROTOCOL}`;

const SYSTEM = buildPhaseSystemPrompt(TEACH_INSTRUCTION);

export const runTeachAgent = (
  messages: ModelMessage[],
  onPartialAssistantMessage?: (content: string) => void,
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    phase: "teach",
    system: SYSTEM,
    messages,
    schema: PhaseAgentOutputSchema,
    schemaName: "teach_output",
    tools: { recordScenarioSpec },
    errorMessage: "Failed to run the Teach step.",
    onPartialAssistantMessage,
  });
