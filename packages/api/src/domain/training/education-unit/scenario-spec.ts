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
// Two shapes: ScenarioSpec is what the agent emits through recordScenarioSpec
// (no pass — the model never decides which round it is on); ScenarioSpecRecord
// is the persisted form with the round stamped by the orchestrator, so the
// context builder can tell a prior round's spec from the current round's.
import type {
  UnitScenarioSpec,
  UnitScenarioSpecRecord,
} from "@acme/validators";
import { UnitScenarioSpecSchema } from "@acme/validators";

export const ScenarioSpecSchema = UnitScenarioSpecSchema;
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
 * The evaluator's rubric context for a scored solve answer: the canonical
 * answer it grades toward and the rubric it grades against.
 */
export const renderEvalRubricContext = (spec: ScenarioSpec): string =>
  [
    "## Grading reference",
    `Target skill: ${spec.targetSkill}`,
    renderWorldState(spec),
    `Canonical answer: ${spec.canonicalAnswer}`,
    `Reasoning path: ${spec.reasoningPath}`,
    `Rubric:\n${spec.rubric}`,
  ].join("\n");

/** The grading reference for a Connect scenario that was posed by Teach. */
export const renderConnectGradingContext = (spec: ScenarioSpec): string =>
  [
    "## Active connection scenario",
    "The Teach beat already posed this round's evolved scenario. Grade the learner's latest answer; do not present another scenario.",
    `Target skill: ${spec.targetSkill}`,
    renderWorldState(spec),
    `Canonical answer: ${spec.canonicalAnswer}`,
    `Reasoning path: ${spec.reasoningPath}`,
    `Rubric:\n${spec.rubric}`,
  ].join("\n");
