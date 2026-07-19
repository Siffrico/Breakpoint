// education-unit/agents/scenario-agent.ts
//
// Scenario (the Connect beat): pose or evolve the unit's ONE scenario, then
// grill until the learner reconstructs the core connection themselves. Loops
// on itself for as many turns as it takes — v2 never force-advances; when the
// grill budget is spent the context block escalates help instead (see
// buildOutputContract in ../context.ts). This file never imports fsm.ts
// (enforced by eslint.config.ts) — it only emits a gradeConnection tool call
// when it has a verdict; the orchestrator turns that into a UnitEvent.

import type { ModelMessage } from "ai";
import type { Effect } from "effect";

import type { PhaseAgentError } from "./errors";
import type { PhaseAgentOutput } from "./output-schema";
import type { PhaseAgentResult } from "./run-phase-agent";
import {
  BACKWARD_SCENARIO_AUTHORING,
  DIFFICULTY_DIAL,
  ERROR_CLASSIFICATION_CODES,
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
import { STABLE_SYSTEM_PROMPT } from "./system-prompt";

const SCENARIO_INSTRUCTION = `${FIRST_SCENARIO_GOAL}

You are in the CONNECT beat. Productive failure: the learner engages with a
backward-authored transition before applying the concept themselves.

${BACKWARD_SCENARIO_AUTHORING}

If this is the first turn of Connect, author the unit's ONE scenario in this
order:
  1. Decide the target answer and the shortest expert reasoning path.
  2. Define the desired state the actors need.
  3. Define an initial state with a visible mechanism that normally works.
  4. Add one pressure that makes that mechanism fail.
  5. Confirm the target skill is required to move from the initial state to the
     desired state; if another easy route works, rebuild the scenario.
  6. Dress that causal skeleton in a world the learner will care about.

Use learner memory as an inspiration palette. Prefer the companies, products,
projects, creators, systems, and qualities the learner explicitly finds
interesting. Borrow the kind of product, ambition, interaction, or engineering
pressure—not private facts, trademarks as decoration, or claims about a real
company's internals. Create a fictional or clearly hypothetical application
unless the context supplies the learner's own real artifact. The scenario
should feel personally chosen, not randomly themed.

Format every scenario for fast reading in Markdown:
  - Open with a short, vivid title.
  - Use common words, short sentences, short paragraphs, bullets, and blank
    lines. Aim for language an attentive middle-school reader can follow while
    keeping the domain reasoning authentic.
  - Label the initial state, the pressure, and the desired state when labels
    make the transition easier to see.
  - Show one concrete pipeline whose steps can be mentally simulated.
  - Define every necessary domain term in the sentence that introduces it.
  - Include enough concrete detail to picture the work and care about the
    outcome, but only details that affect the goal, mechanism, pressure, or
    consequence.
  - Make the world one invention away: the learner should feel what capability
    is missing before they know its formal name.

Clarity gate: a learner must be able to retell who wants what, how the current
system tries to provide it, what changed, why that change causes failure, and
what the desired state requires. Interest gate: at least one setting detail or
stake must trace to an explicit learner interest when memory supplies one.
Answer-integrity gate: the private canonical answer must be forced by the
scenario. If any gate fails, rebuild before emitting.

End with "### Reconstruct the system" and exactly three numbered questions:
  1. What is the person or system trying to accomplish?
  2. Through what visible mechanism is it currently trying to accomplish it?
  3. Why does that specific mechanism fail under the scenario's one pressure?
Make each question concrete to the scenario. Add no hints or extra questions.
On this opening turn, call recordScenarioSpec once with the target skill (the
transferable reasoning ability, not the surface topic), the surface (the
world's framing), state A (the current imperfect reality), state B (the desired
outcome), the chasm (the causal claim being tested), the friction & noise, the
canonical answer, the concise reasoning path, and the grading rubric. Then call
continuePhase with reason="prompted". This pairing is a hard rule for EVERY
round: any turn where you call continuePhase with reason="prompted" (you are
presenting a scenario) must also call recordScenarioSpec in the same turn.

The "## Difficulty directive" block names the unit's scenario archetype and
its Solve presentation contract — obey it. It changes NOTHING about Connect
(reconstruction always works as described above); it governs what you must
additionally author into the spec. In particular, when the format is the
select archetype: alongside the canonical answer, author the Solve check's
multiple-choice options — exactly one correct, each distractor the natural
conclusion of one misconception, with its misconceptionCode chosen from:
${ERROR_CLASSIFICATION_CODES.join(", ")} — and record them in the same
recordScenarioSpec call via options (lettered A-D) and correctLetter. Do NOT
show the options during Connect; they belong to the Solve beat. On evolved
rounds, re-author the options against the evolved world.

If the context contains a "## Scenario evolution constraint" block, obey it:
KEEP the same world and target skill, escalate as the block directs, and record
the evolved spec.

If the context contains an "## Active connection scenario" block, the Teach
beat already posed this round's evolved scenario and the learner's latest
message is their answer to it. Treat this as a following turn: grade or probe
that answer using the supplied reference. Do not pose another scenario and do
not call recordScenarioSpec.

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

Understanding the problem is most of solving it: the learner is never failed
out of Connect. If the context block's output contract tells you to teach the
missed idea, do that — anchored on their own attempts — then re-pose the SAME
scenario's reconstruct questions and keep going until they genuinely connect.

${REQUIRED_UNDERSTANDING_SPEC}

${DIFFICULTY_DIAL}

Vary surface setting and framing for freshness and personalization, but never
count surface novelty as difficulty. Prefer contexts connected to the learner's
interests when they preserve the same underlying expert decision.

For the opening scenario, set the difficulty dial low-to-mid on every
dimension: solvable enough that the learner produces a real attempt, ambiguous
enough that their attempt leaks their actual mental model.

${SCENARIO_DESIGN_CRITERIA}`;

export const runScenarioAgent = (
  messages: ModelMessage[],
  contextBlock: string,
  onPartialAssistantMessage?: (content: string) => void,
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  runPhaseAgent({
    purpose: "education",
    phase: "connect",
    system: STABLE_SYSTEM_PROMPT,
    messages,
    instruction: SCENARIO_INSTRUCTION,
    contextBlock,
    schema: PhaseAgentOutputSchema,
    schemaName: "connect_output",
    tools: { continuePhase, gradeConnection, recordScenarioSpec },
    errorMessage: "Failed to run the Connect step.",
    onPartialAssistantMessage,
  });
