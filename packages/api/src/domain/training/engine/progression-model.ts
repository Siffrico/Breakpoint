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
//   skillset (ability / legacy cluster) — the ELO tier climb. Mastered at
//     peak rating with a tight deviation. Legacy clusters additionally hold
//     their syllabus frontier honest (`checksSyllabusFrontier`); v2 abilities
//     own no syllabus of their own.
//
// The model deliberately reads the EXISTING stored `skillMap` jsonb shape —
// old rows keep working; what changes is that the regime distinction is
// decided here once instead of being reconstructed per call site.

import type { ScenarioFormat } from "@acme/validators";

export interface StoredSkillMap {
  workflow: { name: string; steps: string[] };
  bandRamp: { startRating: number; peakRating: number };
  masteryContract: {
    exitCriteria: string[];
    maxRatingDeviation?: number;
  };
  scenarioFormats?: ScenarioFormat[];
}

const LEGACY_SCENARIO_FORMAT: ScenarioFormat = {
  id: "legacy_frq",
  label: "Legacy free response",
  kind: "frq",
  description: "A free-response scenario using the legacy authoring contract.",
};

export const resolveScenarioFormats = (
  skillMap: StoredSkillMap | null | undefined,
): readonly ScenarioFormat[] =>
  skillMap?.scenarioFormats && skillMap.scenarioFormats.length > 0
    ? skillMap.scenarioFormats
    : [LEGACY_SCENARIO_FORMAT];

/** Default mastery gate width when the contract does not narrow it. */
export const DEFAULT_MAX_RATING_DEVIATION = 80;

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
      mastery: { peakRating: number; maxRatingDeviation: number };
      /** Legacy skill_cluster: unchecked syllabus entries also block mastery. */
      checksSyllabusFrontier: boolean;
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
    case "skill_cluster":
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
          peakRating: bandRamp.peakRating,
          maxRatingDeviation:
            masteryContract.maxRatingDeviation ?? DEFAULT_MAX_RATING_DEVIATION,
        },
        checksSyllabusFrontier: node.kind === "skill_cluster",
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

export const parseAbilityStage = (
  value: string | null | undefined,
): AbilityStage | null =>
  value && (ABILITY_STAGES as readonly string[]).includes(value)
    ? (value as AbilityStage)
    : null;
