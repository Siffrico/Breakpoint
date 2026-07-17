export interface DifficultyDialPreset {
  readonly steps: [number, number];
  readonly withheldGivens: [number, number];
  readonly alternatives: [number, number];
}

export const BASE_PER_FORMAT_KIND = { mcq: 900, frq: 1050 } as const;
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
