// engine/scenario-archetypes.ts
//
// The closed scenario-archetype library. The curriculum designer picks ONE
// archetype per ability (a reasoned pick, not a rotation); every unit under
// that ability solves in that response mode. Connect is untouched by the
// archetype — reconstruction always — the archetype only governs how the
// Solve beat's check is presented, what the spec must additionally record,
// and how the three difficulty-dial axes are interpreted.
//
// This file is the one place an archetype's contract lives: the canonical
// ScenarioFormat the engine circulates, and the directive lines rendered into
// every phase agent's context (see engine/rating/render.ts). Adding an
// archetype means adding an entry here — no other file enumerates them.

import type { ScenarioArchetype, ScenarioFormat } from "@acme/validators";

export const SELECT_OPTION_COUNT = 4;

/** The canonical ScenarioFormat each archetype circulates through the engine. */
export const ARCHETYPE_FORMATS: Record<ScenarioArchetype, ScenarioFormat> = {
  select: {
    id: "select",
    label: "Selected response (MCQ)",
    kind: "mcq",
    description:
      "The Solve check is a multiple-choice question about the unit's scenario world: one correct option, distractors that each encode a named misconception.",
    optionCount: SELECT_OPTION_COUNT,
  },
  transform: {
    id: "transform",
    label: "Produce the transformation",
    kind: "frq",
    description:
      "The Solve check asks the learner to produce the path or artifact that carries state A to state B. State B may be fully specified or a terse directive.",
  },
  judge: {
    id: "judge",
    label: "Evaluate and justify",
    kind: "frq",
    description:
      "The Solve check presents artifact(s) claimed to cross A to B; the learner must find what breaks, or pick between candidates, and justify from the causal mechanism.",
  },
};

/**
 * Per-archetype directive lines appended to the difficulty directive block.
 * Each entry states the Solve presentation contract and reinterprets the
 * three dial axes (reasoning steps / withheld givens / embedded alternatives)
 * for that response mode, so the counted-structure difficulty measurement
 * keeps working across archetypes.
 */
const ARCHETYPE_DIRECTIVE_LINES: Record<ScenarioArchetype, readonly string[]> =
  {
    select: [
      "- Solve presentation (select archetype): pose the Solve check as a multiple-choice question. Output the options as plain Markdown lines lettered A-D (one per line), exactly one correct. Author the options at scenario-authoring time and record them via recordScenarioSpec (options + correctLetter); every distractor must be the natural conclusion of one named misconception (its misconceptionCode).",
      "- Dial axes for select: reasoning steps = hops required before the options discriminate; withheld givens = values or assumptions the stem forces the learner to derive rather than states; embedded alternatives = near-miss distractors (proximity to the key is the difficulty, count them as the distractors you engineer).",
    ],
    transform: [
      "- Solve presentation (transform archetype): the Solve check asks the learner to produce the path or artifact that carries state A to state B.",
      "- Dial axes for transform: reasoning steps = length of the A→B path; withheld givens = missing constraints AND the specificity of state B itself (withholding B's success criteria turns the check into a terse directive like 'make it far faster' — then the canonical answer must first state the expert success criteria, and the rubric must grade criteria-setting as well as the path); embedded alternatives = tempting wrong approaches woven into the world.",
    ],
    judge: [
      "- Solve presentation (judge archetype): the Solve check presents one or more concrete candidate artifacts, plans, or a running system with symptoms — each plausibly claimed to cross A to B — and asks the learner what breaks, or which candidate survives and why. The verdict must be justified from the causal mechanism, never from taste.",
      "- Dial axes for judge: reasoning steps = depth of the causal chain from symptom or flaw to root mechanism; withheld givens = evidence not handed over (a strong answer names what it would need to confirm); embedded alternatives = the candidate artifacts and red-herring flaws themselves (defensible-but-wrong candidates, seeded non-flaws).",
    ],
  };

export const archetypeDirectiveLines = (
  archetype: ScenarioArchetype,
): readonly string[] => ARCHETYPE_DIRECTIVE_LINES[archetype];

const isArchetype = (id: string): id is ScenarioArchetype =>
  id in ARCHETYPE_FORMATS;

/**
 * Maps any circulating ScenarioFormat back to its archetype. Canonical
 * formats map by id; legacy free-form formats (pre-archetype plans authored
 * 6-8 of them per ability) map by kind — mcq behaves as select, frq as
 * transform, which matches how those plans actually ran.
 */
export const archetypeOfFormat = (format: ScenarioFormat): ScenarioArchetype =>
  isArchetype(format.id) ? format.id : format.kind === "mcq" ? "select" : "transform";
