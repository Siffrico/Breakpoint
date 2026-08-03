import type { DifficultyVector, ScenarioFormat } from "@acme/validators";

import type { DifficultyBand } from "./decide";
import type { DifficultyDialPreset } from "./difficulty-priors";
import { validateDifficultyBands } from "./decide";
import {
  BAND_DIAL_PRESETS,
  BASE_PER_FORMAT_KIND,
  DIFFICULTY_COUNT_WEIGHTS,
} from "./difficulty-priors";

export const predictItemRating = (
  vector: DifficultyVector,
  formats: readonly ScenarioFormat[],
): number => {
  const counts = [
    vector.reasoningPathSteps,
    vector.withheldGivens,
    vector.embeddedAlternatives,
  ];
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
    throw new RangeError(
      "difficulty vector counts must be non-negative integers",
    );
  }
  const format = formats.find((candidate) => candidate.id === vector.formatId);
  if (!format)
    throw new RangeError(`unknown scenario format: ${vector.formatId}`);
  return (
    BASE_PER_FORMAT_KIND[format.kind] +
    vector.reasoningPathSteps * DIFFICULTY_COUNT_WEIGHTS.perStep +
    vector.withheldGivens * DIFFICULTY_COUNT_WEIGHTS.perWithheldGiven +
    vector.embeddedAlternatives * DIFFICULTY_COUNT_WEIGHTS.perAlternative
  );
};

const BAND_LABELS = [
  "Supported · scaffolded case",
  "Realistic · messy case",
  "Adversarial · transfer case",
] as const;

export const deriveCanonicalDifficultyBands = (
  format: ScenarioFormat,
): readonly DifficultyBand[] =>
  validateDifficultyBands(
    Object.entries(BAND_DIAL_PRESETS).map(([orderText, preset]) => {
      const order = Number(orderText);
      const ratingFor = (index: 0 | 1) =>
        predictItemRating(
          {
            formatId: format.id,
            reasoningPathSteps: preset.steps[index],
            withheldGivens: preset.withheldGivens[index],
            embeddedAlternatives: preset.alternatives[index],
          },
          [format],
        );
      return {
        order,
        minRating: ratingFor(0),
        maxRating: ratingFor(1),
        label: BAND_LABELS[order],
      };
    }),
  );

const axisAudit = (value: number, range: readonly [number, number]) => ({
  value,
  range,
  inRange: value >= range[0] && value <= range[1],
});

export const auditDialCompliance = (
  vector: DifficultyVector,
  preset: DifficultyDialPreset,
) => ({
  reasoningPathSteps: axisAudit(vector.reasoningPathSteps, preset.steps),
  withheldGivens: axisAudit(vector.withheldGivens, preset.withheldGivens),
  embeddedAlternatives: axisAudit(
    vector.embeddedAlternatives,
    preset.alternatives,
  ),
});
