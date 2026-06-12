import type { RatingPolicy, SupportLevel } from "./policy";
import { scoreToOutcome } from "./glicko";
import { DEFAULT_RATING_POLICY, SUPPORT_LEVELS } from "./policy";

/**
 * Attempt evidence — the only signals the engine is allowed to learn from.
 *
 * There is no hint mechanism (deliberately: hints bred reliance), so observed
 * difficulty comes from exactly four low-friction channels:
 *  1. the rubric score (primary)
 *  2. the eval's error codes (the *reason* for the score)
 *  3. sidechat ask count during the attempt (revealed support-seeking)
 *  4. attempt timing (already tracked as attemptTiming in workspace turns)
 */

export interface AttemptEvidence {
  /** Difficulty band the scenario was generated from. */
  readonly bandOrder: number;
  /** Rubric score 0–100 from the evaluator. */
  readonly score: number;
  /** Support level the scenario itself was generated with. */
  readonly offeredSupport: SupportLevel;
  /** Questions asked in the ask-sidechat while this attempt was open. */
  readonly sidechatAskCount: number;
  /** True when the attempt exceeded its time limit (from attemptTiming). */
  readonly wasOverTime: boolean;
  /** Item rating the scenario was generated at. */
  readonly itemRating: number;
  /** When the attempt was evaluated. */
  readonly occurredAt: Date;
}

export interface AttemptRecord {
  /** Difficulty band this evidence belongs to. Gates never mix bands. */
  readonly bandOrder: number;
  /** Support level the scenario was generated with. */
  readonly offeredSupport: SupportLevel;
  /** Item rating the scenario claimed/generated at. */
  readonly itemRating: number;
  /** Raw rubric score from the evaluator, retained for audit/calibration. */
  readonly score: number;
  /**
   * Glicko outcome in [0,1]: the score as partial credit, discounted for
   * revealed support (sidechat reliance) and time overrun, so an assisted 90
   * updates the rating like a solid solo attempt rather than mastery.
   */
  readonly outcome: number;
  /**
   * The support the learner *actually used*: the offered scaffolding, bumped
   * up one level when sidechat usage exceeded the free allowance. Promotion
   * gates read this, not `offeredSupport` — passing a bare scenario while
   * leaning on the sidechat is not an unsupported pass.
   */
  readonly effectiveSupport: SupportLevel;
  /** Pass at/above `passScore`, within the sidechat allowance, on time. */
  readonly cleanPass: boolean;
  /** Score >= passScore regardless of support — used by the fade gate. */
  readonly pass: boolean;
  /** Score < backOffScore — two of these in a row trigger a back-off. */
  readonly hardFail: boolean;
  /** When the attempt was evaluated. */
  readonly occurredAt: Date;
}

const supportIndex = (level: SupportLevel): number => {
  const index = SUPPORT_LEVELS.indexOf(level);
  if (index === -1) {
    throw new RangeError(`unknown support level: ${String(level)}`);
  }
  return index;
};

/** One notch more scaffolded; saturates at the most supported level. */
export const raiseSupport = (level: SupportLevel): SupportLevel =>
  SUPPORT_LEVELS[Math.max(0, supportIndex(level) - 1)] ?? level;

/** One notch less scaffolded; saturates at "none". */
export const fadeSupport = (level: SupportLevel): SupportLevel =>
  SUPPORT_LEVELS[
    Math.min(SUPPORT_LEVELS.length - 1, supportIndex(level) + 1)
  ] ?? level;

export const isLowSupport = (level: SupportLevel): boolean => level === "none";

/**
 * Grade one attempt's evidence into the quality signals the estimator and the
 * decision ladder consume. Throws only when the score is outside [0,100]
 * (propagated from `scoreToOutcome`); all other inputs are clamped, since a
 * weird sidechat count should soften the outcome, not crash the turn.
 */
export const assessAttempt = (
  evidence: AttemptEvidence,
  policy: RatingPolicy = DEFAULT_RATING_POLICY,
): AttemptRecord => {
  if (!Number.isInteger(evidence.bandOrder) || evidence.bandOrder < 0) {
    throw new RangeError(
      `bandOrder must be a non-negative integer, got ${evidence.bandOrder}`,
    );
  }
  if (!Number.isFinite(evidence.itemRating)) {
    throw new RangeError(
      `itemRating must be finite, got ${evidence.itemRating}`,
    );
  }
  supportIndex(evidence.offeredSupport);

  const rawOutcome = scoreToOutcome(evidence.score);
  const asks = Math.max(0, Math.floor(evidence.sidechatAskCount));

  const extraAsks = Math.max(0, asks - policy.cleanPassMaxSidechatAsks);
  const sidechatDiscount = Math.min(
    policy.maxSidechatDiscount,
    extraAsks * policy.sidechatDiscountPerExtraAsk,
  );
  const timeDiscount = evidence.wasOverTime ? policy.overTimeDiscount : 0;
  const outcome = rawOutcome * (1 - sidechatDiscount) * (1 - timeDiscount);

  const effectiveSupport =
    extraAsks > 0
      ? raiseSupport(evidence.offeredSupport)
      : evidence.offeredSupport;

  const pass = evidence.score >= policy.passScore;
  return {
    bandOrder: evidence.bandOrder,
    offeredSupport: evidence.offeredSupport,
    itemRating: evidence.itemRating,
    score: evidence.score,
    outcome,
    effectiveSupport,
    pass,
    cleanPass: pass && extraAsks === 0 && !evidence.wasOverTime,
    hardFail: evidence.score < policy.backOffScore,
    occurredAt: evidence.occurredAt,
  };
};
