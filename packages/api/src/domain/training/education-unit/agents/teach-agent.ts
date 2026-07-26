// education-unit/agents/teach-agent.ts
//
// Teach/Feedback: both teaching beats of a unit, one agent.
//
//   - "orient": the unit's opening — activate prior knowledge, set stakes,
//     and return no event or scenario artifact.
//   - "seam": the worked-example teach between rounds, delivered after the
//     learner has struggled through a round. It EVOLVES the unit's one
//     scenario (same world, escalated friction — the context block's
//     evolution constraint directs it) and returns the evolved scenarioSpec;
//     its closing why-probe is the next round's Connect.
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
import { getPhaseAgentOutputSchema } from "./output-schema";
import { runPhaseAgent } from "./run-phase-agent";
import { STABLE_SYSTEM_PROMPT } from "./system-prompt";

export type TeachBeat = "orient" | "seam";

const ORIENT_INSTRUCTION = `You are in the ORIENT beat, the very start of this unit.

Your job is to give the learner a clear, usable model of the skill before they
apply it. Teach in two parts: first give them the map, then show one expert trip
through that map.

## 1. Give the map

Open with one short overview sentence that says:
  - what the skill is made of,
  - how those parts work together, and
  - the useful result the skill produces.

If the topic sits inside a larger system, name that system and decompose it
before plugging the topic into it. For example, an index belongs to a database:
the database stores tables, a table has columns and rows, and an index gives the
database a separate route for finding rows through selected column values.

Use the learner's project or goal when the context supplies one. Introduce
required vocabulary at the exact point where it names something the learner
already understands; never begin with a glossary.

## 2. Show one expert trip

Choose one realistic job that a practitioner uses this skill to complete. State
the initial state, the desired state, and the obstacle between them. Work through
the job in order. At each important move, expose the useful expert judgment:
what the expert notices, what that evidence means, what they choose, why that
choice fits, and how they verify the result. This is a concise worked example,
not a survey of examples.

Use code, a small Mermaid diagram, a trace, or concrete output when it makes an
invisible mechanism observable. Explain what the learner should notice in the
artifact. Never include an artifact that merely repeats the prose.

## Clarity standard

Build from facts the learner can already picture. Introduce one new relationship
at a time, then connect it to the previous one. Define an unfamiliar term in
plain language when it first appears. Never explain one unknown with several
more unknowns.

Do not hide the mechanism inside words such as "helps," "handles," "manages,"
"optimizes," "processes," or "works." Name the actor, the action it takes, the
thing that changes, and why that change produces the result.

Organize the response with short descriptive headings, short paragraphs, and
bullets or numbered steps where they make the structure easier to scan. Prefer
easy diction and concrete nouns. Keep it concise, but never create brevity by
removing a causal step the learner needs.

Before answering, check the explanation for closed-loop clarity: the learner
should be able to describe the parts, trace the mechanism from input to result,
and explain the worked example's decisions without needing an unstated bridge.
Repair any missing bridge in the response.

This is a single teaching response. There is nothing to grade, and Connect owns
the learner's first application, so do not pose a problem for them to solve yet.
Keep the complete learner-facing response under 320 words.`;

const SEAM_INSTRUCTION = `You are in the TEACH beat, the seam between two rounds of this unit's one
evolving scenario. The learner has just finished struggling through a round —
this is the worked-example payoff and reasoning repair for that struggle.

Read the transcript as evidence. Reconstruct the learner's approach across all
relevant attempts; do not react only to the last sentence. Distinguish a local
mistake from the deeper mental model that generated it.

## 1. Map their reasoning

Begin with a compact diagnosis grounded in exact moves from the learner:
  - what they noticed correctly,
  - what they did or concluded,
  - where their reasoning diverged from an expert's, and
  - the underlying assumption or missing relationship that produced the
    visible errors.

Quote only the short phrases needed as evidence. Do not produce a scolding list
of mistakes. Show the causal architecture: "Because you modeled X as Y, you
then chose A, which caused B." Group several surface errors under one root model
when that is the truthful explanation.

## 2. Give the corrected map

State one short overview sentence that says what the skill is made of, how its
parts work together, and what useful result it produces. If the topic belongs
inside a larger system, decompose that system into familiar parts and show
exactly where the topic plugs in. Define every unfamiliar term at first use.

Contrast the two models explicitly:
  - Learner model: what they treated as true.
  - Expert model: what is actually true and the mechanism that makes it true.
  - Consequence: why the models predict different outcomes.

## 3. Replay it as an expert worked example

Solve the same kind of job from its initial state to its desired state. At every
decision that repairs the learner's model, connect three things: the learner's
move, the expert's move, and why the expert move follows from the mechanism.
Expose what the expert notices, what the evidence means, what they choose, the
tradeoff, and how they verify the result.

Use code, a small Mermaid diagram, a trace, or concrete output when it makes an
invisible mechanism observable. Explain what to notice. Never add an artifact
that merely decorates or repeats the prose.

## Clarity standard

Introduce one new relationship at a time and connect it to the previous one.
Do not hide a mechanism inside words such as "helps," "handles," "manages,"
"optimizes," "processes," or "works." Name the actor, action, changed state,
and causal result. Use short descriptive headings, short paragraphs, and bullets
or numbered steps where they improve scanning. Keep the response concise, but
never omit a causal bridge the learner needs.

Before answering, check for closed-loop clarity: the learner should be able to
trace why their model failed, run the corrected model mentally, and predict why
the expert workflow succeeds. Repair any unstated bridge in the response.

## 4. Evolve and check transfer

Obey the "## Scenario evolution constraint" block: keep the same world, make
the prior outcome history, and add one complication that makes the corrected
mechanism matter in a harder form. End with one why-probe inside that evolved
scenario. Ask the learner to use the corrected model to predict or decide, never
to repeat a definition.

The why-probe IS the next round's Connect scenario. Author it backwards —
decide its target answer before writing it — and return scenarioSpec with the
evolved state A, state B, the chasm, the friction, the canonical answer, the
concise reasoning path, and the grading rubric. The
learner's next message will be graded against this spec; do not add a second
scenario or ask whether they understand.

This is a single response. There is nothing to grade yet. Keep the complete
learner-facing response under 450 words.

${ERROR_CLASSIFICATION_PROTOCOL}`;

export const runTeachAgent = (
  beat: TeachBeat,
  messages: ModelMessage[],
  contextBlock: string,
  onPartialAssistantMessage?: (content: string) => void,
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> =>
  beat === "orient"
    ? runPhaseAgent({
        purpose: "education",
        phase: "orient",
        system: STABLE_SYSTEM_PROMPT,
        messages,
        instruction: ORIENT_INSTRUCTION,
        contextBlock,
        schema: getPhaseAgentOutputSchema("orient"),
        schemaName: "orient_output",
        errorMessage: "Failed to run the Orient step.",
        onPartialAssistantMessage,
      })
    : runPhaseAgent({
        purpose: "education",
        phase: "teach",
        system: STABLE_SYSTEM_PROMPT,
        messages,
        instruction: SEAM_INSTRUCTION,
        contextBlock,
        schema: getPhaseAgentOutputSchema("teach"),
        schemaName: "teach_output",
        errorMessage: "Failed to run the Teach step.",
        onPartialAssistantMessage,
      });
