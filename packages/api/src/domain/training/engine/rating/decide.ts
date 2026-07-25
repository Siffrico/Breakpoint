import type {
  DirectiveIntent,
  JobProgressState,
  ScenarioDirective,
} from "@acme/validators";

import type { AttemptRecord } from "./evidence";
import type { JobRatingState } from "./glicko";
import type { MisconceptionState } from "./misconceptions";
import type { RatingPolicy } from "./policy";
import { fadeSupport, isLowSupport, raiseSupport } from "./evidence";
import { targetItemRating } from "./glicko";
import { selectRepairTarget } from "./misconceptions";
import { DEFAULT_RATING_POLICY, SUPPORT_LEVELS } from "./policy";

// The persisted rating contract lives in `@acme/validators` so the API engine
// and the database cannot drift. Re-export the shapes the engine builds on so
// existing imports (`from "../engine/rating"`) keep resolving unchanged.
export type { DirectiveIntent, JobProgressState, ScenarioDirective };

/**
 * The Goldilocks decision ladder. A deterministic state machine over
 * (band, support level), guarded by the Glicko estimate. The LLM never picks
 * difficulty — it receives this directive and executes it. Every branch sets
 * a human-readable `reason`, which is both the decision log and the
 * "why this scenario" chip, for free.
 *
 * Priority order (first match wins):
 *   mastered if no active repair → repair → probe → back_off → promote →
 *   fade_support → challenge
 */

/** One difficulty band within a job, easy → hard by ascending `order`. */
export interface DifficultyBand {
  /** 0-based position within the job; bands must be contiguous from 0. */
  readonly order: number;
  /** Rating range this band's scenarios live in. */
  readonly minRating: number;
  readonly maxRating: number;
  /** Optional label for prompts/UI ("two-step word problems"). */
  readonly label?: string;
}

export interface DecideInput {
  /** Already-decayed rating state (call `decayRatingState` first). */
  readonly rating: JobRatingState;
  readonly progress: JobProgressState;
  /** The job's bands, any order; must be contiguous from order 0. */
  readonly bands: readonly DifficultyBand[];
  readonly misconceptions: readonly MisconceptionState[];
  /** Recent assessed attempts in this job, oldest → newest. */
  readonly recentAttempts: readonly AttemptRecord[];
  readonly policy?: RatingPolicy;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number): number => Math.round(value);

const lastN = <T>(items: readonly T[], n: number): T[] => items.slice(-n);

const bandByOrder = (
  bands: readonly DifficultyBand[],
  order: number,
): DifficultyBand | undefined => bands.find((band) => band.order === order);

const midOf = (band: DifficultyBand): number =>
  (band.minRating + band.maxRating) / 2;

export const validateDifficultyBands = (
  bands: readonly DifficultyBand[],
): readonly DifficultyBand[] => {
  if (bands.length === 0) {
    throw new RangeError("decideNextScenario requires at least one band");
  }

  // Bands come from an LLM curriculum generator — validate hard so malformed
  // ladders fail loudly instead of silently mis-routing difficulty.
  const sorted = [...bands].sort((a, b) => a.order - b.order);
  sorted.forEach((candidate, index) => {
    if (candidate.order !== index) {
      throw new RangeError(
        `difficulty bands must be contiguous from order 0; got orders [${sorted
          .map((b) => b.order)
          .join(", ")}]`,
      );
    }
    if (candidate.minRating >= candidate.maxRating) {
      throw new RangeError(
        `band ${candidate.order} has an empty rating range (${candidate.minRating}-${candidate.maxRating})`,
      );
    }

    const previous = sorted[index - 1];
    if (!previous) return;
    if (candidate.minRating < previous.minRating) {
      throw new RangeError(
        `band ${candidate.order} must not start below band ${previous.order} (${candidate.minRating} < ${previous.minRating})`,
      );
    }
    if (candidate.maxRating <= previous.maxRating) {
      throw new RangeError(
        `band ${candidate.order} must have a higher ceiling than band ${previous.order} (${candidate.maxRating} <= ${previous.maxRating})`,
      );
    }
  });
  return sorted;
};

const attemptsInBand = (
  attempts: readonly AttemptRecord[],
  bandOrder: number,
): AttemptRecord[] =>
  attempts.filter((attempt) => attempt.bandOrder === bandOrder);

/**
 * The 4C/ID evidence window: the last N attempts were clean passes at
 * effective support "none". Both promotion and mastery require this — rating
 * alone never advances anyone, because rating can be earned on supported
 * tasks.
 */
const hasCleanUnsupportedWindow = (
  recentAttempts: readonly AttemptRecord[],
  bandOrder: number,
  count: number,
): boolean => {
  const window = lastN(attemptsInBand(recentAttempts, bandOrder), count);
  if (window.length < count) return false;
  return window.every(
    (attempt) => attempt.cleanPass && isLowSupport(attempt.effectiveSupport),
  );
};

/**
 * True when the learner has earned the next band: rating near the ceiling,
 * uncertainty low, and the clean-unsupported evidence window holds.
 */
export const checkPromotionGate = (
  rating: JobRatingState,
  band: DifficultyBand,
  recentAttempts: readonly AttemptRecord[],
  policy: RatingPolicy = DEFAULT_RATING_POLICY,
): boolean => {
  if (rating.rating < band.maxRating - policy.promoteRatingMargin) return false;
  if (rating.ratingDeviation > policy.promoteDeviationCeiling) return false;
  return hasCleanUnsupportedWindow(
    recentAttempts,
    band.order,
    policy.promoteCleanPassCount,
  );
};

/**
 * Mastery is NOT the promotion gate applied to the top band — the top band
 * has no ceiling to approach (a learner whose true ability sits mid-band
 * would never converge to ceiling − margin). Mastered means: solidly within
 * the top band (at or above its midpoint), low uncertainty, and the same
 * clean-unsupported evidence window.
 */
export const checkMasteryGate = (
  rating: JobRatingState,
  topBand: DifficultyBand,
  recentAttempts: readonly AttemptRecord[],
  policy: RatingPolicy = DEFAULT_RATING_POLICY,
): boolean => {
  if (rating.rating < midOf(topBand)) return false;
  if (rating.ratingDeviation > policy.masteryDeviationCeiling) return false;
  return hasCleanUnsupportedWindow(
    recentAttempts,
    topBand.order,
    policy.promoteCleanPassCount,
  );
};

/**
 * Decide the next scenario for this job. Takes the decayed rating, current
 * progress, the band ladder, active misconceptions and recent attempt
 * records; produces a `ScenarioDirective`. Throws only when the band ladder
 * is empty or the progress state points at a band that does not exist —
 * both mean corrupted curriculum data that must not silently degrade.
 */
export const decideNextScenario = (input: DecideInput): ScenarioDirective => {
  const policy = input.policy ?? DEFAULT_RATING_POLICY;
  const { rating, progress, bands, misconceptions, recentAttempts } = input;

  const sorted = validateDifficultyBands(bands);
  const band = bandByOrder(sorted, progress.bandOrder);
  if (!band) {
    throw new RangeError(
      `progress references band ${progress.bandOrder}, which does not exist`,
    );
  }
  const topOrder = sorted[sorted.length - 1]?.order ?? 0;
  const r = round(rating.rating);
  const rd = round(rating.ratingDeviation);

  const inBand = (value: number): number =>
    round(clamp(value, band.minRating, band.maxRating));
  const goldilocks = inBand(
    targetItemRating(
      rating.rating,
      policy.targetExpectedScore,
      policy.defaultItemRatingDeviation,
    ),
  );

  const repairTarget = selectRepairTarget(misconceptions);

  // 1. Mastered: top band beaten clean without support, with low uncertainty
  //    and no active misconception waiting to be repaired.
  if (
    !repairTarget &&
    progress.bandOrder === topOrder &&
    checkMasteryGate(rating, band, recentAttempts, policy)
  ) {
    return {
      intent: "mastered",
      bandOrder: topOrder,
      supportLevel: "none",
      targetItemRating: goldilocks,
      targetMisconceptionCode: null,
      reason: `Top band passed clean without support at rating ${r} (±${rd}) — job mastered.`,
      nextProgress: { bandOrder: topOrder, supportLevel: "none" },
    };
  }

  // 2. Repair: an active misconception preempts difficulty optimisation.
  //    Same band, one notch more support — 4C/ID raises support before it
  //    ever lowers difficulty.
  if (repairTarget) {
    const supportLevel = raiseSupport(progress.supportLevel);
    return {
      intent: "repair",
      bandOrder: band.order,
      supportLevel,
      targetItemRating: inBand(
        targetItemRating(
          rating.rating,
          policy.targetExpectedScore,
          policy.defaultItemRatingDeviation,
        ),
      ),
      targetMisconceptionCode: repairTarget.code,
      reason: `Active misconception "${repairTarget.code}" (seen ${repairTarget.occurrences}x) — remediating before pushing difficulty.`,
      nextProgress: { bandOrder: band.order, supportLevel },
    };
  }

  // 3. Probe: uncertainty too high to optimise challenge — localise the
  //    rating fast with a mid-band, neutrally supported scenario.
  if (rating.ratingDeviation > policy.probeDeviationThreshold) {
    return {
      intent: "probe",
      bandOrder: band.order,
      supportLevel: "guided",
      targetItemRating: round(midOf(band)),
      targetMisconceptionCode: null,
      reason: `Rating uncertain (±${rd}) — probing mid-band to localise ability before tuning difficulty.`,
      nextProgress: { bandOrder: band.order, supportLevel: "guided" },
    };
  }

  // 4. Back off: consecutive hard fails. Raise support first; only drop a
  //    band when already at max support (rare — usually means the band
  //    boundaries or a prerequisite job are wrong).
  const currentBandAttempts = attemptsInBand(recentAttempts, band.order);
  const failWindow = lastN(currentBandAttempts, policy.backOffFailCount);
  const consecutiveHardFails =
    failWindow.length >= policy.backOffFailCount &&
    failWindow.every((attempt) => attempt.hardFail);
  if (consecutiveHardFails) {
    const atMaxSupport = progress.supportLevel === SUPPORT_LEVELS[0];
    if (atMaxSupport && band.order > 0) {
      const lowerBand = bandByOrder(sorted, band.order - 1);
      if (lowerBand) {
        return {
          intent: "back_off",
          bandOrder: lowerBand.order,
          supportLevel: "guided",
          targetItemRating: round(
            clamp(
              targetItemRating(
                rating.rating,
                policy.targetExpectedScore,
                policy.defaultItemRatingDeviation,
              ),
              lowerBand.minRating,
              lowerBand.maxRating,
            ),
          ),
          targetMisconceptionCode: null,
          reason: `${policy.backOffFailCount} hard fails at full support — dropping to band ${lowerBand.order} to rebuild.`,
          nextProgress: { bandOrder: lowerBand.order, supportLevel: "guided" },
        };
      }
    }
    const supportLevel = raiseSupport(progress.supportLevel);
    return {
      intent: "back_off",
      bandOrder: band.order,
      supportLevel,
      targetItemRating: goldilocks,
      targetMisconceptionCode: null,
      reason: `${policy.backOffFailCount} consecutive hard fails — raising support to "${supportLevel}" before touching difficulty.`,
      nextProgress: { bandOrder: band.order, supportLevel },
    };
  }

  // 5. Promote: gate passed — next band, support reset to maximum (worked
  //    example first), per 4C/ID's restart-supported-at-the-new-level.
  if (
    band.order < topOrder &&
    checkPromotionGate(rating, band, recentAttempts, policy)
  ) {
    const nextBand = bandByOrder(sorted, band.order + 1);
    if (nextBand) {
      const supportLevel = SUPPORT_LEVELS[0];
      return {
        intent: "promote",
        bandOrder: nextBand.order,
        supportLevel,
        targetItemRating: round(
          clamp(
            targetItemRating(
              rating.rating,
              policy.targetExpectedScore,
              policy.defaultItemRatingDeviation,
            ),
            nextBand.minRating,
            nextBand.maxRating,
          ),
        ),
        targetMisconceptionCode: null,
        reason: `Band ${band.order} cleared clean without support at rating ${r} (±${rd}) — promoting to band ${nextBand.order} with full support.`,
        nextProgress: { bandOrder: nextBand.order, supportLevel },
      };
    }
  }

  // 6. Fade support: recent passes at this support level — remove one notch
  //    of scaffolding while holding difficulty in the Goldilocks zone.
  const fadeWindow = lastN(
    currentBandAttempts.filter(
      (attempt) => attempt.offeredSupport === progress.supportLevel,
    ),
    policy.fadePassCount,
  );
  const earnedFade =
    !isLowSupport(progress.supportLevel) &&
    fadeWindow.length >= policy.fadePassCount &&
    fadeWindow.every(
      (attempt) =>
        attempt.pass && attempt.effectiveSupport === progress.supportLevel,
    );
  if (earnedFade) {
    const supportLevel = fadeSupport(progress.supportLevel);
    return {
      intent: "fade_support",
      bandOrder: band.order,
      supportLevel,
      targetItemRating: goldilocks,
      targetMisconceptionCode: null,
      reason: `${policy.fadePassCount} passes at "${progress.supportLevel}" support — fading to "${supportLevel}".`,
      nextProgress: { bandOrder: band.order, supportLevel },
    };
  }

  // 7. Challenge: the default — hold band and support, target the ~70%
  //    expected-score point.
  return {
    intent: "challenge",
    bandOrder: band.order,
    supportLevel: progress.supportLevel,
    targetItemRating: goldilocks,
    targetMisconceptionCode: null,
    reason: `Rating ${r} (±${rd}) — targeting ~${goldilocks} for ~${Math.round(
      policy.targetExpectedScore * 100,
    )}% expected success in band ${band.order}.`,
    nextProgress: {
      bandOrder: band.order,
      supportLevel: progress.supportLevel,
    },
  };
};
