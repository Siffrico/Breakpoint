import type { PracticeContract, ScenarioFormat } from "@acme/validators";

import type { DifficultyBand } from "./rating/decide";
import type { BandRamp } from "./rating/expand-band-ladder";
import { expandSkillBands } from "./rating/expand-band-ladder";
import { DEFAULT_RATING_POLICY } from "./rating/policy";
import { ARCHETYPE_FORMATS } from "./scenario-archetypes";

export const resolveScenarioFormat = (
  practiceContract: PracticeContract,
): ScenarioFormat => ARCHETYPE_FORMATS[practiceContract.responseMode];

export const DEFAULT_MAX_RATING_DEVIATION =
  DEFAULT_RATING_POLICY.masteryDeviationCeiling;

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

export interface ProgressionModel {
  regime: "main_outcome";
  workflow: PracticeContract["workflow"];
  bandRamp: { startRating: number; peakRating: number };
  mastery: {
    masteryRating: number;
    maxRatingDeviation: number;
  };
}

export const regimeForNodeKind = (
  kind: string,
): ProgressionModel["regime"] | null =>
  kind === "outcome" ? "main_outcome" : null;

export const resolveProgressionModel = (node: {
  kind: string;
  practiceContract: PracticeContract | null;
  difficultyBands?: readonly DifficultyBand[] | null;
}): ProgressionModel | null => {
  if (node.kind !== "outcome" || !node.practiceContract) return null;
  const bands = node.difficultyBands;
  if (!bands?.length) return null;
  const ordered = [...bands].sort((left, right) => left.order - right.order);
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return null;
  const bandRamp = {
    startRating: first.maxRating,
    peakRating: last.maxRating,
  };
  return {
    regime: "main_outcome",
    workflow: node.practiceContract.workflow,
    bandRamp,
    mastery: {
      masteryRating: masteryRatingOf(bands, bandRamp),
      maxRatingDeviation:
        node.practiceContract.maxRatingDeviation ??
        DEFAULT_MAX_RATING_DEVIATION,
    },
  };
};

export const difficultyRampOf = (
  model: ProgressionModel,
): { startRating: number; peakRating: number } => model.bandRamp;
