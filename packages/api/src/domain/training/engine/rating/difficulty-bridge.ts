import type { DifficultyVector, ScenarioFormat } from "@acme/validators";

import type { DifficultyBand } from "./decide";
import type { DifficultyDialPreset } from "./difficulty-priors";
import { validateDifficultyBands } from "./decide";
import {
  BAND_DIAL_GUIDES,
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

interface DialCounts {
  steps: number;
  withheldGivens: number;
  alternatives: number;
}

const validateDialGuide = (guide: DifficultyDialPreset): void => {
  for (const [min, max] of [
    guide.steps,
    guide.withheldGivens,
    guide.alternatives,
  ]) {
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 0 ||
      max < min
    ) {
      throw new RangeError(
        "difficulty guide ranges must be ordered non-negative integers",
      );
    }
  }
};

const buildDialPath = (guide: DifficultyDialPreset): DialCounts[] => {
  const start: DialCounts = {
    steps: guide.steps[0],
    withheldGivens: guide.withheldGivens[0],
    alternatives: guide.alternatives[0],
  };
  const limits: DialCounts = {
    steps: guide.steps[1],
    withheldGivens: guide.withheldGivens[1],
    alternatives: guide.alternatives[1],
  };
  const weights: Record<keyof DialCounts, number> = {
    steps: DIFFICULTY_COUNT_WEIGHTS.perStep,
    withheldGivens: DIFFICULTY_COUNT_WEIGHTS.perWithheldGiven,
    alternatives: DIFFICULTY_COUNT_WEIGHTS.perAlternative,
  };
  const path = [start];
  let current = start;

  while (
    current.steps < limits.steps ||
    current.withheldGivens < limits.withheldGivens ||
    current.alternatives < limits.alternatives
  ) {
    const nextAxis = (["steps", "withheldGivens", "alternatives"] as const)
      .filter((axis) => current[axis] < limits[axis])
      .sort((left, right) => {
        const leftSpan = limits[left] - start[left];
        const rightSpan = limits[right] - start[right];
        const leftProgress = (current[left] - start[left] + 1) / leftSpan;
        const rightProgress = (current[right] - start[right] + 1) / rightSpan;
        return leftProgress - rightProgress || weights[left] - weights[right];
      })[0];
    if (!nextAxis) break;
    current = { ...current, [nextAxis]: current[nextAxis] + 1 };
    path.push(current);
  }

  return path;
};

/** Choose monotonically increasing dial counts closest to the target rating. */
export const chooseDifficultyDials = ({
  targetItemRating,
  format,
  guide,
}: {
  targetItemRating: number;
  format: ScenarioFormat;
  guide: DifficultyDialPreset;
}): DifficultyDialPreset => {
  if (!Number.isFinite(targetItemRating)) {
    throw new RangeError("target item rating must be finite");
  }
  validateDialGuide(guide);
  const chosen = buildDialPath(guide)
    .map((counts) => ({
      ...counts,
      ratingGap: Math.abs(
        predictItemRating(
          {
            formatId: format.id,
            reasoningPathSteps: counts.steps,
            withheldGivens: counts.withheldGivens,
            embeddedAlternatives: counts.alternatives,
          },
          [format],
        ) - targetItemRating,
      ),
    }))
    .sort((left, right) => left.ratingGap - right.ratingGap)[0];
  if (!chosen)
    throw new RangeError("difficulty guide has no valid dial values");

  return {
    steps: [chosen.steps, chosen.steps],
    withheldGivens: [chosen.withheldGivens, chosen.withheldGivens],
    alternatives: [chosen.alternatives, chosen.alternatives],
  };
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
    Object.entries(BAND_DIAL_GUIDES).map(([orderText, guide]) => {
      const order = Number(orderText);
      const ratingFor = (index: 0 | 1) =>
        predictItemRating(
          {
            formatId: format.id,
            reasoningPathSteps: guide.steps[index],
            withheldGivens: guide.withheldGivens[index],
            embeddedAlternatives: guide.alternatives[index],
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
