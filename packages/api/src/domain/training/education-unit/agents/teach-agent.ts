// education-unit/agents/teach-agent.ts
//
// Teach/Feedback: both teaching beats of a unit, one agent.
//
//   - "orient": the unit's opening — activate prior knowledge, set stakes,
//     never reveal the mechanism. No tools, no verdict.
//   - "seam": the worked-example teach between rounds, delivered after the
//     learner has struggled through a round. It EVOLVES the unit's one
//     scenario (same world, escalated friction — the context block's
//     evolution constraint directs it) and records the evolved spec via
//     recordScenarioSpec; its closing why-probe is the next round's Connect.
//
// Single-shot either way: the orchestrator fires fsm's teach_done event
// automatically once the response lands; the FSM decision was never this
// agent's to make.

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

export type TeachBeat = "orient" | "seam";

const ORIENT_INSTRUCTION = `You are in the ORIENT beat, the very start of this unit.

In one response:
  - Activate what the learner already knows that is relevant here — tie it to
    their project or stated goal where you can.
  - Set the stakes: why this specific unit's skill matters, made concrete
    (a real consequence of not having it, not a generic "this is important").
  - Where the syllabus lists vocabulary this unit must land, introduce the
    term naturally inside the stakes — the learner should meet the word where
    it matters, not in a glossary.
  - Do NOT reveal the mechanism, the answer, or even a strong hint of how the
    upcoming scenario works. The learner must arrive at Connect not knowing
    the mechanism yet — that is the entire point of productive failure.

This is a single response. There is nothing to grade here — do not ask the
learner to solve anything yet.`;

const SEAM_INSTRUCTION = `You are in the TEACH beat, the seam between two rounds of this unit's one
evolving scenario. The learner has just finished struggling through a round —
this is the worked-example payoff for that struggle.

In one response:
  - Quote back the specific move in their last round's attempt(s) you are
    anchoring the teaching on. Generic openings are a fail.
  - Teach the concept as a worked example built on that move. Chunk it: one
    idea per short block, each grounded in something the learner did.
  - Name any surrogate pattern they fell into, explicitly: "you reasoned as
    if X, but the actual mechanism is Y because Z."
  - Explain the mechanism (the WHY), not just the surface rule — the learner
    should leave able to predict, not just recite.
  - Then EVOLVE the scenario: obey the "## Scenario evolution constraint"
    block — same world, the prior round's outcome is now history, a new
    complication or escalated friction makes the same mechanism fire in a
    harder form. End with a why-probe set INSIDE the evolved scenario that
    asks the learner to generate the mechanism in their own words against the
    new complication. Never a definition recall.

The why-probe IS the next round's Connect scenario. Author it backwards —
decide its target answer before writing it — and call recordScenarioSpec
exactly once with the evolved state A, state B, the chasm, the friction, the
canonical answer, the concise reasoning path, and the grading rubric. The
learner's next message will be graded against this spec; do not add a second
scenario or ask whether they understand.

This is a single response. There is nothing to grade yet.

${ERROR_CLASSIFICATION_PROTOCOL}`;

const ORIENT_SYSTEM = buildPhaseSystemPrompt(ORIENT_INSTRUCTION);
const SEAM_SYSTEM = buildPhaseSystemPrompt(SEAM_INSTRUCTION);

export const runTeachAgent = (
  beat: TeachBeat,
  messages: ModelMessage[],
  onPartialAssistantMessage?: (content: string) => void,
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  beat === "orient"
    ? runPhaseAgent({
        purpose: "education",
        phase: "orient",
        system: ORIENT_SYSTEM,
        messages,
        schema: PhaseAgentOutputSchema,
        schemaName: "orient_output",
        errorMessage: "Failed to run the Orient step.",
        onPartialAssistantMessage,
      })
    : runPhaseAgent({
        purpose: "education",
        phase: "teach",
        system: SEAM_SYSTEM,
        messages,
        schema: PhaseAgentOutputSchema,
        schemaName: "teach_output",
        tools: { recordScenarioSpec },
        errorMessage: "Failed to run the Teach step.",
        onPartialAssistantMessage,
      });
