import type { RatingPolicy } from "./policy";
import { DEFAULT_RATING_POLICY } from "./policy";

/**
 * Glicko-2 estimator. Pure math — no AI SDK, no DB, no HTTP. This is the only
 * place a rating or deviation is ever computed; everything else reads them.
 *
 * Implementation follows Glickman's published Glicko-2 paper, with two
 * adaptations for a learning (rather than chess) context:
 *  - outcomes are fractional in [0,1] (rubric partial credit), not win/loss
 *  - decay inflates deviation and gently mean-reverts the rating, modelling
 *    forgetting; an untouched job becomes uncertain again
 */

/**
 * 400 / ln(10) — converts between Elo-scale ratings and Glicko-2 mu/phi.
 * Computed exactly (rather than Glickman's truncated 173.7178) so the
 * invariant expectedScore(r, targetItemRating(r, E)) === E holds to float
 * precision.
 */
const GLICKO_SCALE = 400 / Math.LN10;

/** Convergence tolerance for the volatility iteration. */
const VOLATILITY_EPSILON = 1e-6;

export interface JobRatingState {
  /** Elo-scale rating estimate; starts at the policy baseline (1000). */
  readonly rating: number;
  /** Rating deviation — the uncertainty on `rating`. Starts at 350. */
  readonly ratingDeviation: number;
  /** Glicko-2 volatility (sigma). */
  readonly volatility: number;
  /** When evidence was last folded in. Null until the first attempt. */
  readonly lastRatedAt: Date | null;
}

export interface RatedOutcome {
  /** Fractional result in [0,1] — rubric partial credit, post evidence discounts. */
  readonly outcome: number;
  /** The scenario's structurally predicted item rating. */
  readonly itemRating: number;
  /** Uncertainty on the item rating; defaults to the policy's high value. */
  readonly itemRatingDeviation?: number;
}

export const createInitialRatingState = (
  policy: RatingPolicy = DEFAULT_RATING_POLICY,
): JobRatingState => ({
  rating: policy.baselineRating,
  ratingDeviation: policy.initialRatingDeviation,
  volatility: policy.initialVolatility,
  lastRatedAt: null,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Glicko g(phi): how much an opponent's uncertainty dampens the update. */
const g = (phi: number): number =>
  1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

/**
 * Probability in (0,1) that a learner at `learnerRating` beats an item at
 * `itemRating`. With `itemRatingDeviation` of 0 this is exactly the Elo
 * logistic 1 / (1 + 10^((item - learner) / 400)); a positive deviation
 * shrinks the prediction toward 0.5.
 */
export const expectedScore = (
  learnerRating: number,
  itemRating: number,
  itemRatingDeviation = 0,
): number => {
  const mu = (learnerRating - itemRating) / GLICKO_SCALE;
  const phi = itemRatingDeviation / GLICKO_SCALE;
  return 1 / (1 + Math.exp(-g(phi) * mu));
};

/**
 * The item rating at which the learner's expected score equals `target`
 * (default: the policy's 0.7 sweet spot). Inverts the SAME formula as
 * {@link expectedScore}, including the g(phi) dampening for item-rating
 * uncertainty — otherwise the engine targets "70%" while its own prediction
 * log says ~67%, and the calibration loop chases a phantom gap. For targets
 * above 0.5 this sits BELOW the learner's rating — the brief's formula has
 * the sign flipped, so the invariant
 * `expectedScore(r, targetItemRating(r, E, rd), rd) === E` is the test that
 * must always hold. Throws when `target` is not in (0,1).
 */
export const targetItemRating = (
  learnerRating: number,
  target = DEFAULT_RATING_POLICY.targetExpectedScore,
  itemRatingDeviation = DEFAULT_RATING_POLICY.defaultItemRatingDeviation,
): number => {
  if (target <= 0 || target >= 1) {
    throw new RangeError(
      `targetExpectedScore must be strictly between 0 and 1, got ${target}`,
    );
  }
  const phi = itemRatingDeviation / GLICKO_SCALE;
  return (
    learnerRating - (Math.log(target / (1 - target)) / g(phi)) * GLICKO_SCALE
  );
};

/**
 * Map a rubric score (0–100) to a Glicko outcome in [0,1]. Throws when the
 * score is out of range — a bad score means an upstream schema failed and
 * must not silently corrupt the rating.
 */
export const scoreToOutcome = (score: number): number => {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError(`rubric score must be in [0,100], got ${score}`);
  }
  return score / 100;
};

const MS_PER_DAY = 86_400_000;

/**
 * Inflate deviation (and gently mean-revert the rating) for time spent
 * untouched. Idempotent for `now <= lastRatedAt + grace`; never pushes
 * deviation past the policy ceiling. A future `lastRatedAt` is treated as
 * zero elapsed time rather than throwing — clock skew should not crash a
 * turn.
 */
export const decayRatingState = (
  state: JobRatingState,
  now: Date,
  policy: RatingPolicy = DEFAULT_RATING_POLICY,
): JobRatingState => {
  if (state.lastRatedAt === null) return state;
  const elapsedDays = Math.max(
    0,
    (now.getTime() - state.lastRatedAt.getTime()) / MS_PER_DAY,
  );
  if (elapsedDays <= policy.decayGraceDays) return state;

  const periods =
    (elapsedDays - policy.decayGraceDays) / policy.decayPeriodDays;
  const inflated = Math.sqrt(
    state.ratingDeviation ** 2 + periods * policy.decayDeviationPerPeriod ** 2,
  );
  const reversion = 1 - (1 - policy.decayMeanReversionPerPeriod) ** periods;

  return {
    ...state,
    rating: state.rating + (policy.baselineRating - state.rating) * reversion,
    ratingDeviation: clamp(
      inflated,
      policy.minRatingDeviation,
      policy.maxRatingDeviation,
    ),
  };
};

/**
 * Glicko-2 volatility update — solves f(x) = 0 with the Illinois variant of
 * regula falsi, exactly as in the paper.
 */
const updateVolatility = (
  phi: number,
  v: number,
  delta: number,
  sigma: number,
  tau: number,
): number => {
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    return (
      (ex * (delta2 - phi2 - v - ex)) / (2 * (phi2 + v + ex) ** 2) -
      (x - a) / (tau * tau)
    );
  };

  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > VOLATILITY_EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
};

/**
 * Fold one evaluated attempt into the rating state. Takes the (already
 * decayed) state and a fractional outcome against a rated item; produces the
 * new state. Throws when the outcome is outside [0,1] — bad evidence must
 * never reach the estimator.
 */
export const updateRatingState = (
  state: JobRatingState,
  result: RatedOutcome,
  now: Date,
  policy: RatingPolicy = DEFAULT_RATING_POLICY,
): JobRatingState => {
  const { outcome, itemRating } = result;
  if (!Number.isFinite(outcome) || outcome < 0 || outcome > 1) {
    throw new RangeError(`outcome must be in [0,1], got ${outcome}`);
  }
  const itemDeviation =
    result.itemRatingDeviation ?? policy.defaultItemRatingDeviation;

  const mu = (state.rating - policy.baselineRating) / GLICKO_SCALE;
  const phi = state.ratingDeviation / GLICKO_SCALE;
  const muItem = (itemRating - policy.baselineRating) / GLICKO_SCALE;
  const phiItem = itemDeviation / GLICKO_SCALE;

  const gItem = g(phiItem);
  // Clamp E away from 0/1 so v stays finite on extreme mismatches.
  const e = clamp(1 / (1 + Math.exp(-gItem * (mu - muItem))), 1e-6, 1 - 1e-6);

  const v = 1 / (gItem * gItem * e * (1 - e));
  const delta = v * gItem * (outcome - e);

  const sigmaNext = updateVolatility(
    phi,
    v,
    delta,
    state.volatility,
    policy.tau,
  );
  const phiStar = Math.sqrt(phi * phi + sigmaNext * sigmaNext);
  const phiNext = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNext = mu + phiNext * phiNext * gItem * (outcome - e);

  return {
    rating: policy.baselineRating + muNext * GLICKO_SCALE,
    ratingDeviation: clamp(
      phiNext * GLICKO_SCALE,
      policy.minRatingDeviation,
      policy.maxRatingDeviation,
    ),
    volatility: sigmaNext,
    lastRatedAt: now,
  };
};
