import type { DifficultyBand } from "./decide";
import { validateDifficultyBands } from "./decide";

/**
 * Designer intent for a cluster's difficulty span. The curriculum designer
 * emits only these two numbers per cluster instead of a full 3-band ladder
 * per unit — the ladders are pure arithmetic, so code derives them
 * deterministically and the LLM never hand-types (and never mis-ramps) the
 * dozens of band numbers a cluster would otherwise require.
 */
export interface BandRamp {
  /** Top-band ceiling of the first (easiest) unit in the cluster. */
  readonly startRating: number;
  /** Top-band ceiling of the last (hardest) unit in the cluster. */
  readonly peakRating: number;
}

/** Each unit gets a 3-band ladder; each band spans this many rating points. */
const BAND_WIDTH = 200;
const BANDS_PER_UNIT = 3;

/** The full vertical span of a unit's ladder (3 bands stacked). */
const UNIT_LADDER_SPAN = BAND_WIDTH * BANDS_PER_UNIT;

/**
 * Derive the difficulty-band ladder for a single unit from its cluster's
 * ramp and its position in the cluster.
 *
 * The unit's top-band ceiling is interpolated linearly from `startRating`
 * (unit 0) to `peakRating` (the final unit). Below that ceiling we stack
 * three contiguous {@link BAND_WIDTH}-point bands, so every unit gets an
 * ordered 0/1/2 ladder whose ceilings rise across the cluster.
 *
 * Because ceilings are monotonic non-decreasing by construction, the result
 * always satisfies the same invariants the persisted curriculum is validated
 * against. We still run it through {@link validateDifficultyBands} so a
 * degenerate ramp fails loudly here rather than silently mis-routing
 * difficulty downstream.
 */
export const expandUnitBands = (
  unitIndex: number,
  unitCount: number,
  ramp: BandRamp,
): DifficultyBand[] => {
  if (unitIndex < 0 || unitIndex >= unitCount) {
    throw new RangeError(
      `unitIndex ${unitIndex} is out of range for a cluster of ${unitCount} units`,
    );
  }
  if (ramp.peakRating <= ramp.startRating) {
    throw new RangeError(
      `band ramp peakRating (${ramp.peakRating}) must be greater than startRating (${ramp.startRating})`,
    );
  }

  // A single-unit cluster sits at the start of the ramp; otherwise spread the
  // top ceiling evenly from start (unit 0) to peak (final unit).
  const progress = unitCount <= 1 ? 0 : unitIndex / (unitCount - 1);
  const topCeiling = Math.round(
    ramp.startRating + (ramp.peakRating - ramp.startRating) * progress,
  );
  const floor = topCeiling - UNIT_LADDER_SPAN;

  const bands: DifficultyBand[] = Array.from(
    { length: BANDS_PER_UNIT },
    (_unused, order) => ({
      order,
      minRating: floor + order * BAND_WIDTH,
      maxRating: floor + (order + 1) * BAND_WIDTH,
      label: BAND_LABELS[order],
    }),
  );

  // Throws RangeError on any malformed ladder (e.g. a degenerate ramp that
  // collapses a band's range). Returns a sorted copy we don't otherwise need.
  validateDifficultyBands(bands);

  return bands;
};

const BAND_LABELS = [
  "Supported · scaffolded case",
  "Realistic · messy case",
  "Adversarial · transfer case",
] as const;

/** One canonical ladder for a dynamically minted skill and all of its units. */
export const expandSkillBands = (ramp: BandRamp): DifficultyBand[] => {
  if (ramp.peakRating <= ramp.startRating) {
    throw new RangeError(
      `band ramp peakRating (${ramp.peakRating}) must be greater than startRating (${ramp.startRating})`,
    );
  }
  const floor = ramp.startRating - BAND_WIDTH;
  const width = Math.max(Math.round((ramp.peakRating - floor) / 3), 1);
  const bands = [0, 1, 2].map((order) => ({
    order,
    minRating: floor + order * width,
    maxRating: order === 2 ? ramp.peakRating : floor + (order + 1) * width,
    label: BAND_LABELS[order],
  }));
  return [...validateDifficultyBands(bands)];
};
