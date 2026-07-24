// engine/progression-model.ts
//
// The canonical decision about WHICH pedagogy governs a curriculum node,
// made exactly once, at the data boundary. Everything downstream switches on
// `model.regime` instead of re-deriving the rules from `node.kind`:
//
//   foundation (skill nodes)            — criterion-referenced. Mastered when
//     every concept reaches the coverage target. Has NO rating gate: its
//     bandRamp is a calibration artifact (scenario difficulty only), derived
//     from the ability's floor, and can never gate mastery.
//   skillset (ability) — the ELO tier climb. Mastered at peak rating with a
//     tight deviation. Abilities own no knowledge map; their child skills do.

import type { ScenarioArchetype, ScenarioFormat } from "@acme/validators";

import type { DifficultyBand } from "./rating/decide";
import type { BandRamp } from "./rating/expand-band-ladder";
import { expandSkillBands } from "./rating/expand-band-ladder";
import { DEFAULT_RATING_POLICY } from "./rating/policy";
import { ARCHETYPE_FORMATS } from "./scenario-archetypes";

export interface StoredSkillMap {
  workflow: { name: string; steps: string[] };
  bandRamp: { startRating: number; peakRating: number };
  masteryContract: {
    exitCriteria: string[];
    maxRatingDeviation?: number;
  };
  /** The ability's ONE archetype, picked by the curriculum designer. */
  scenarioArchetype: ScenarioArchetype;
}

export const resolveScenarioFormat = (
  skillMap: StoredSkillMap,
): ScenarioFormat => ARCHETYPE_FORMATS[skillMap.scenarioArchetype];

/**
 * Default mastery gate width when the contract does not narrow it. Reads the
 * rating policy rather than restating a number: `checkMasteryGate` in
 * rating/decide.ts gates single scenarios on the same threshold, and the two
 * had drifted (80 here, 100 there), so an ability could be refused mastery by
 * the progression engine that the rating engine considered settled.
 */
export const DEFAULT_MAX_RATING_DEVIATION =
  DEFAULT_RATING_POLICY.masteryDeviationCeiling;

/**
 * The rating an ability's skillset climb must reach: the MIDPOINT of the top
 * band, never its ceiling.
 *
 * The ceiling is the single hardest scenario the archetype can express (every
 * dial maxed). A learner whose true ability sits comfortably inside the top
 * band converges to the middle of it and stops — so gating on the ceiling meant
 * abilities never completed, which read as the curriculum stalling rather than
 * as a bar being missed. This mirrors `checkMasteryGate` in rating/decide.ts,
 * which already reasoned this out for single scenarios; keep the two in step.
 *
 * Uses the node's own persisted bands when it has them, falling back to the
 * canonical ladder the ramp expands into.
 */
export const masteryRatingOf = (
  bands: readonly DifficultyBand[] | null | undefined,
  ramp: BandRamp,
): number => {
  const ladder = bands && bands.length > 0 ? bands : expandSkillBands(ramp);
  const topBand = ladder.reduce((highest, band) =>
    band.order > highest.order ? band : highest,
  );
  return Math.round((topBand.minRating + topBand.maxRating) / 2);
};

/**
 * Foundation units are criterion-referenced, so their ramp exists only to
 * keep the shared scenario machinery calibrated at a modest, fixed span above
 * the owning ability's floor. It is difficulty seasoning, never a gate.
 */
export const FOUNDATION_RAMP_SPAN = 200;

export const foundationCalibrationRamp = (abilityRamp: {
  startRating: number;
}): { startRating: number; peakRating: number } => ({
  startRating: abilityRamp.startRating,
  peakRating: abilityRamp.startRating + FOUNDATION_RAMP_SPAN,
});

export type ProgressionModel =
  | {
      regime: "foundation";
      workflow: StoredSkillMap["workflow"];
      /** Scenario-difficulty calibration only — never consulted for mastery. */
      calibrationRamp: { startRating: number; peakRating: number };
    }
  | {
      regime: "skillset";
      workflow: StoredSkillMap["workflow"];
      bandRamp: { startRating: number; peakRating: number };
      mastery: { masteryRating: number; maxRatingDeviation: number };
    };

/**
 * The single kind→regime mapping. Null: the node runs no mastery loop.
 * Accepts the raw varchar from the row so the boundary needs no cast.
 */
export const regimeForNodeKind = (
  kind: string,
): ProgressionModel["regime"] | null => {
  switch (kind) {
    case "skill":
      return "foundation";
    case "ability":
      return "skillset";
    default:
      return null;
  }
};

/**
 * Takes a node's kind and stored skillMap; produces the progression model
 * governing it, or null when the node runs no mastery loop (legacy/imported
 * plans, structural nodes). This is the one place regime is decided.
 */
export const resolveProgressionModel = (node: {
  kind: string;
  skillMap: StoredSkillMap | null;
  difficultyBands?: readonly DifficultyBand[] | null;
}): ProgressionModel | null => {
  const regime = regimeForNodeKind(node.kind);
  if (!regime || !node.skillMap) return null;
  const { workflow, bandRamp, masteryContract } = node.skillMap;
  switch (regime) {
    case "foundation":
      return {
        regime,
        workflow,
        calibrationRamp: foundationCalibrationRamp(bandRamp),
      };
    case "skillset":
      return {
        regime,
        workflow,
        bandRamp,
        mastery: {
          masteryRating: masteryRatingOf(node.difficultyBands, bandRamp),
          maxRatingDeviation:
            masteryContract.maxRatingDeviation ?? DEFAULT_MAX_RATING_DEVIATION,
        },
      };
  }
};

/** The ramp the shared difficulty machinery reads, regardless of regime. */
export const difficultyRampOf = (
  model: ProgressionModel,
): { startRating: number; peakRating: number } =>
  model.regime === "foundation" ? model.calibrationRamp : model.bandRamp;

/**
 * An ability's executable progression stage — deliberately separate from its
 * lifecycle `status`. `status: "ready"` only says the ability's track is
 * active/visible; the stage says what may actually RUN under it:
 *
 *   foundations — its child skills' foundation units run; skillset units may not.
 *   skillset    — every child skill is mastered; the ELO tier climb is open.
 *   mastered    — the ability's climb is finished.
 *
 * Null on rows written before the column existed; callers fall back to
 * deriving the stage from child-skill completion (see recovery).
 */
export type AbilityStage = "foundations" | "skillset" | "mastered";

const ABILITY_STAGES: readonly AbilityStage[] = [
  "foundations",
  "skillset",
  "mastered",
];

export const requireAbilityStage = (value: string | null): AbilityStage => {
  if ((ABILITY_STAGES as readonly string[]).includes(value ?? "")) {
    return value as AbilityStage;
  }
  throw new Error("Ability node is missing a valid progression stage.");
};
