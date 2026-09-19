/**
 * Rating policy — the ONE file you edit to retune the Goldilocks engine.
 *
 * The model: each (learner, job) pair carries a Glicko-2 rating. A small
 * deterministic ladder (`decideNextScenario`) reads that rating plus recent
 * attempt evidence and decides the next scenario's band, support level and
 * target item rating. Nothing here knows about the AI SDK, the database, or
 * HTTP. Change a number, change behaviour.
 *
 * Evidence constraints this policy encodes: there is no hint mechanism, so
 * "support" means how scaffolded the scenario itself is (worked example →
 * guided → none), and the only low-friction difficulty signals are the check
 * results, the eval's error codes, sidechat ask count during the attempt, and
 * attempt timing.
 */

import type { SupportLevel } from "@acme/validators";

/**
 * How scaffolded the scenario is when presented. This is the 4C/ID support
 * axis: fade support within a band before raising difficulty. Order matters —
 * index 0 is the most supported.
 */
export const SUPPORT_LEVELS = [
  "worked_example",
  "guided",
  "none",
] as const satisfies readonly SupportLevel[];
// Support level is part of the persisted rating contract; the canonical enum
// lives in `@acme/validators` so the runtime ladder above and the database
// cannot drift. `satisfies` guarantees the ordered ladder stays a valid subset.
export type { SupportLevel };

export interface RatingPolicy {
  /** Rating every learner and job starts at, and the mean decay drifts toward. */
  readonly baselineRating: number;

  /** Starting rating deviation (uncertainty). 350 = "we know nothing yet". */
  readonly initialRatingDeviation: number;

  /** Floor for deviation so ratings never become unfalsifiably confident. */
  readonly minRatingDeviation: number;

  /** Ceiling for deviation; decay inflation stops here. */
  readonly maxRatingDeviation: number;

  /** Glicko-2 initial volatility (sigma). */
  readonly initialVolatility: number;

  /**
   * Glicko-2 system constant (tau). Smaller = volatility changes more slowly.
   * 0.3–1.2 is the published range; 0.5 is a safe default.
   */
  readonly tau: number;

  /**
   * Deviation assumed for a structurally predicted item rating. Scenarios are bespoke
   * and seen once, so their claimed difficulty is never corrected — a high
   * deviation keeps one mis-estimated scenario from yanking the learner's
   * rating.
   */
  readonly defaultItemRatingDeviation: number;

  /** The Goldilocks sweet spot: pick items the learner beats ~70% of the time. */
  readonly targetExpectedScore: number;

  /** Days of inactivity that count as one decay period. */
  readonly decayPeriodDays: number;

  /** No decay is applied until this many days of inactivity have passed. */
  readonly decayGraceDays: number;

  /**
   * Rating-deviation points added (in quadrature) per decay period. This is
   * the forgetting model: an untouched job becomes *uncertain* again, which
   * sends the ladder back into probe mode — review days emerge from the math.
   */
  readonly decayDeviationPerPeriod: number;

  /**
   * Fraction of the gap to `baselineRating` the rating drifts back per decay
   * period. Models skill fade itself, not just uncertainty. Keep small.
   */
  readonly decayMeanReversionPerPeriod: number;

  /**
   * Sidechat asks during an attempt that are "free" before the attempt stops
   * counting as clean. Asking one clarifying question is normal; leaning on
   * the sidechat to solve the task is revealed support.
   */
  readonly cleanPassMaxSidechatAsks: number;

  /**
   * Multiplicative discount on the Glicko outcome per sidechat ask beyond the
   * free allowance. A heavily assisted attempt should update the rating less
   * than an unsupported attempt with the same checks met.
   */
  readonly sidechatDiscountPerExtraAsk: number;

  /** Cap on the total sidechat discount. */
  readonly maxSidechatDiscount: number;

  /** Multiplicative discount on the outcome when the attempt ran over time. */
  readonly overTimeDiscount: number;

  /**
   * Deviation above which the ladder probes (mid-band, neutral support) to
   * localise the rating instead of optimising challenge. With this much
   * uncertainty, "70% expected score" is meaningless anyway.
   */
  readonly probeDeviationThreshold: number;

  /** Deviation must be at or below this for a band promotion. */
  readonly promoteDeviationCeiling: number;

  /**
   * How close (in rating points) to the band ceiling the rating must be
   * before promotion is considered.
   */
  readonly promoteRatingMargin: number;

  /**
   * Consecutive clean passes at no/low support required to promote. This is
   * the 4C/ID gate: rating alone cannot promote you, because rating can be
   * earned on supported tasks.
   */
  readonly promoteCleanPassCount: number;

  /** Consecutive passes at the current support level required to fade support. */
  readonly fadePassCount: number;

  /** Consecutive attempts with no checks met that trigger a back-off. */
  readonly backOffFailCount: number;

  /** Deviation must be at or below this for the job to count as mastered. */
  readonly masteryDeviationCeiling: number;
}

export const DEFAULT_RATING_POLICY: RatingPolicy = {
  baselineRating: 1000,
  initialRatingDeviation: 350,
  minRatingDeviation: 50,
  maxRatingDeviation: 350,
  initialVolatility: 0.06,
  tau: 0.5,
  defaultItemRatingDeviation: 200,
  targetExpectedScore: 0.7,
  decayPeriodDays: 7,
  decayGraceDays: 7,
  decayDeviationPerPeriod: 30,
  decayMeanReversionPerPeriod: 0.05,
  cleanPassMaxSidechatAsks: 1,
  sidechatDiscountPerExtraAsk: 0.07,
  maxSidechatDiscount: 0.2,
  overTimeDiscount: 0.05,
  probeDeviationThreshold: 250,
  promoteDeviationCeiling: 100,
  promoteRatingMargin: 50,
  promoteCleanPassCount: 2,
  fadePassCount: 2,
  backOffFailCount: 2,
  masteryDeviationCeiling: 100,
};
