export interface DifficultyDialPreset {
  readonly steps: [number, number];
  readonly withheldGivens: [number, number];
  readonly alternatives: [number, number];
}

/**
 * Floor difficulty of each response mode, before any dial count is added.
 *
 * The binding constraint: the EASIEST scenario a format can express — base plus
 * one reasoning step, nothing withheld, no alternatives — must land at or below
 * `RatingPolicy.baselineRating` (1000). Otherwise band 0's floor sits above a
 * fresh learner, `decideNextScenario` clamps their Goldilocks target up into a
 * band they cannot reach, and every early pass registers as a large surprise
 * that rockets the rating. frq was 1050 (easiest scenario 1105, a full 105
 * points above baseline) and had exactly that bug. See difficulty-bridge.test.ts,
 * which asserts the invariant so it cannot regress.
 */
export const BASE_PER_FORMAT_KIND = { mcq: 900, frq: 945 } as const;
export const DIFFICULTY_COUNT_WEIGHTS = {
  perStep: 55,
  perWithheldGiven: 45,
  perAlternative: 40,
} as const;

export const BAND_DIAL_PRESETS: Readonly<Record<number, DifficultyDialPreset>> =
  {
    0: { steps: [1, 2], withheldGivens: [0, 1], alternatives: [0, 1] },
    1: { steps: [2, 3], withheldGivens: [1, 2], alternatives: [1, 2] },
    2: { steps: [3, 5], withheldGivens: [2, 3], alternatives: [2, 3] },
  };
