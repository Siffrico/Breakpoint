// education-unit/scenario-spec.ts
//
// The ScenarioSpec: the single artifact the scenario agent produces once and
// everyone downstream reuses. Scenario-scoped, not unit-scoped — a unit runs
// two of them (one per pass). The unit-level invariant is `targetSkill`, which
// lives on the unit recipe/content; a spec only *references* it so pass 2 can
// hold the skill fixed while forcing a brand-new surface.
//
//   scenario agent ─▶ ScenarioSpec ─┬─▶ teach agent  (reads reasoningPath)
//                                    └─▶ eval agent   (reads canonicalAnswer + rubric)
//
// Splitting `targetSkill` (invariant reasoning ability) from `surface` (the
// disposable dressing) is what defeats pass-2 pattern-matching: pass 2 is
// generated with pass 1's spec as a "do NOT reuse these dimensions" reference,
// same skill, new surface, plus a twist that beats a memorized procedure.

// The canonical schema lives in @acme/validators (shared with the DB column's
// .$type<>()), so the persisted contract and the agent contract cannot drift.
import type { UnitScenarioSpec } from "@acme/validators";
import { UnitScenarioSpecSchema } from "@acme/validators";

export const ScenarioSpecSchema = UnitScenarioSpecSchema;
export type ScenarioSpec = UnitScenarioSpec;

/**
 * Renders a prior-pass spec into the "avoid these dimensions" constraint block
 * the scenario agent receives when building pass 2. Keeps the target skill,
 * bans the used surface.
 */
export const renderPriorSurfaceConstraint = (prior: ScenarioSpec): string =>
  [
    "## Transfer constraint (pass 2)",
    `Target skill (KEEP identical): ${prior.targetSkill}`,
    `Surface already used in pass 1 (do NOT reuse this domain, story, or framing): ${prior.surface}`,
    "Build a scenario that exercises the SAME target skill on a NEW surface, and add a twist that defeats a learner who merely memorized the pass-1 procedure. The learner must re-derive, not recall.",
  ].join("\n");

/**
 * The eval agent's rubric context for a pass-2 solve answer: the canonical
 * answer it grades toward and the rubric it grades against.
 */
export const renderEvalRubricContext = (spec: ScenarioSpec): string =>
  [
    "## Grading reference",
    `Target skill: ${spec.targetSkill}`,
    `Canonical answer: ${spec.canonicalAnswer}`,
    `Reasoning path: ${spec.reasoningPath}`,
    `Rubric:\n${spec.rubric}`,
  ].join("\n");
