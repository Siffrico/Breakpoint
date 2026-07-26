// education-unit/scenario-spec.ts
//
// The ScenarioSpec: the single artifact the scenario agent authors once and
// everyone downstream reuses. One scenario per unit — later rounds EVOLVE the
// same world instead of replacing it. The unit-level invariant is `targetSkill`;
// the spec's stateA/stateB/friction shift as the scenario escalates.
//
//   scenario agent ─▶ ScenarioSpec ─┬─▶ teach agent  (reads reasoningPath, evolves the spec)
//                                    └─▶ evaluator    (reads canonicalAnswer + rubric)
//
// Authored BACKWARDS, always: the chasm (the causal claim being tested) comes
// first, then a minimal world state where it fires, then the dressing. A
// scenario whose answer is not forced before the dressing goes on is dead.
//
// Evolution beats replacement: the learner keeps their world (ownership,
// continuity — the engagement substrate) while each round adds friction or a
// new complication. The FINAL round must also mutate a load-bearing constraint
// so a learner who merely memorized the earlier rounds' procedure fails —
// evolution supplies engagement, the mutation supplies the transfer check.

// The canonical schema lives in @acme/validators (shared with the DB column's
// .$type<>()), so the persisted contract and the agent contract cannot drift.
// Two shapes: ScenarioSpec is what the agent emits in structured output (no
// pass — the model never decides which round it is on); ScenarioSpecRecord
// is the persisted form with the round stamped by the orchestrator, so the
// context builder can tell a prior round's spec from the current round's.
import type {
  UnitScenarioSpec,
  UnitScenarioSpecRecord,
} from "@acme/validators";
import { UnitScenarioSpecSchema } from "@acme/validators";

import { ERROR_CLASSIFICATION_CODES } from "../prompts/shared-instructions";

export const ScenarioSpecSchema = UnitScenarioSpecSchema;
export const ScenarioSpecOutputSchema = ScenarioSpecSchema.required({
  stateA: true,
  stateB: true,
  chasm: true,
  frictionNoise: true,
  formatId: true,
  reasoningPathSteps: true,
  withheldGivens: true,
  embeddedAlternatives: true,
}).superRefine((spec, ctx) => {
  if (!spec.options && !spec.correctLetter) return;
  if (!spec.options || !spec.correctLetter) {
    ctx.addIssue({
      code: "custom",
      message: "options and correctLetter must be provided together",
    });
    return;
  }
  if (!spec.options.some((option) => option.letter === spec.correctLetter)) {
    ctx.addIssue({
      code: "custom",
      message: "correctLetter must match one option's letter",
    });
  }
  for (const option of spec.options) {
    if (option.letter === spec.correctLetter) continue;
    if (
      !option.misconceptionCode ||
      !(ERROR_CLASSIFICATION_CODES as readonly string[]).includes(
        option.misconceptionCode,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: `distractor ${option.letter} needs a misconceptionCode from the ERROR_CLASSIFICATION codes`,
      });
    }
  }
});
export type ScenarioSpec = UnitScenarioSpec;
export type ScenarioSpecRecord = UnitScenarioSpecRecord;

const renderWorldState = (spec: ScenarioSpec): string =>
  [
    spec.stateA ? `State A (current reality): ${spec.stateA}` : null,
    spec.stateB ? `State B (desired outcome): ${spec.stateB}` : null,
    spec.chasm ? `Chasm (the causal claim being tested): ${spec.chasm}` : null,
    spec.frictionNoise ? `Friction & noise: ${spec.frictionNoise}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

/**
 * Renders the prior round's spec into the evolution constraint the scenario
 * agent receives when building the next round. Same world, same target skill —
 * escalated friction. On the final round the evolution must also mutate a
 * load-bearing constraint (new fact, changed requirement) so the answer cannot
 * be pattern-matched from the earlier rounds.
 */
export const renderScenarioEvolutionConstraint = (
  prior: ScenarioSpec,
  options: { isFinalRound: boolean },
): string =>
  [
    "## Scenario evolution constraint",
    `Target skill (KEEP identical): ${prior.targetSkill}`,
    `The learner's world so far (KEEP this world — same product, same actors, same stakes): ${prior.surface}`,
    renderWorldState(prior),
    "EVOLVE this scenario, do not replace it: the prior round's outcome is now part of the world's history. Add a new complication or escalate the friction so the same causal mechanism fires in a harder form.",
    options.isFinalRound
      ? "FINAL ROUND: also mutate one load-bearing constraint (a changed requirement, a new fact that invalidates the memorized move) so a learner who only memorized the earlier rounds' procedure fails. They must re-derive from the mechanism, not recall."
      : "Keep the difficulty step small — noticeably harder, never a cliff (proximal development).",
  ].join("\n");

/**
 * Select-archetype specs carry the Solve check's authored options. Rendered
 * into the grading context so the evaluator poses exactly these options and
 * grades the learner's letter against the key — a wrong pick maps to the
 * chosen distractor's misconceptionCode, so it is diagnostic, not just wrong.
 */
const renderMcqOptions = (spec: ScenarioSpec): string | null => {
  if (!spec.options || spec.options.length === 0 || !spec.correctLetter) {
    return null;
  }
  const options = spec.options
    .map(
      (option) =>
        `${option.letter}. ${option.text}${option.misconceptionCode ? ` [distractor for: ${option.misconceptionCode}]` : ""}`,
    )
    .join("\n");
  return [
    "Solve check (select archetype) — pose EXACTLY these options as plain Markdown lines lettered as given; never reveal the bracketed diagnostic tags or the key:",
    options,
    `Correct letter: ${spec.correctLetter}`,
  ].join("\n");
};

/**
 * The evaluator's rubric context for a scored solve answer: the canonical
 * answer it grades toward and the rubric it grades against.
 */
export const renderEvalRubricContext = (spec: ScenarioSpec): string =>
  [
    "## Grading reference",
    `Target skill: ${spec.targetSkill}`,
    renderWorldState(spec),
    renderMcqOptions(spec),
    `Canonical answer: ${spec.canonicalAnswer}`,
    `Reasoning path: ${spec.reasoningPath}`,
    `Rubric:\n${spec.rubric}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

/** The grading reference for the round's already-posed Connect scenario. */
export const renderConnectGradingContext = (spec: ScenarioSpec): string =>
  [
    "## Active connection scenario",
    "This round's scenario has already been posed. Grade the learner's latest answer against it; do not present another scenario.",
    `Target skill: ${spec.targetSkill}`,
    renderWorldState(spec),
    `Canonical answer: ${spec.canonicalAnswer}`,
    `Reasoning path: ${spec.reasoningPath}`,
    `Rubric:\n${spec.rubric}`,
  ].join("\n");
