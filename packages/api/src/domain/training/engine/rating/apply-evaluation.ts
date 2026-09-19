import type { AttemptEvidence, AttemptRecord } from "./evidence";
import type { JobRatingState } from "./glicko";
import type { MisconceptionState } from "./misconceptions";
import type { RatingPolicy } from "./policy";
import { assessAttempt } from "./evidence";
import { decayRatingState, expectedScore, updateRatingState } from "./glicko";
import { reduceMisconceptions } from "./misconceptions";
import { DEFAULT_RATING_POLICY } from "./policy";

/**
 * The single write path for learner state. One evaluated attempt goes in;
 * the new rating state, the updated misconception ledger, the assessed
 * attempt record (append it to the recent-attempts window), and a
 * prediction-log record come out. Still pure — the caller persists the
 * result; nothing here touches the database.
 *
 * The prediction log is the engine's honesty mechanism: every update records
 * what the system *expected* before seeing the outcome. Bucketing predicted
 * vs. actual over time is how you catch a miscalibrated engine (predicted
 * 0.7, actually 0.85 = silently too easy) and a biased generator (claimed
 * item ratings consistently beaten = it under-rates its scenarios).
 */

export interface EvaluatedAttempt extends AttemptEvidence {
  /** Error codes from the evaluator's closed taxonomy. */
  readonly errorCodes: readonly string[];
  /** Uncertainty on the item rating; defaults to the policy's high value. */
  readonly itemRatingDeviation?: number;
  /** Misconception code the scenario targeted, when intent was "repair". */
  readonly targetedMisconceptionCode?: string | null;
}

export interface RatingPredictionRecord {
  /** Learner rating after decay, before this attempt was folded in. */
  readonly ratingBefore: number;
  readonly ratingDeviationBefore: number;
  readonly ratingAfter: number;
  readonly ratingDeviationAfter: number;
  readonly itemRating: number;
  /** What the engine predicted before seeing the outcome. */
  readonly predictedScore: number;
  /** What actually happened (discounted outcome in [0,1]). */
  readonly actualOutcome: number;
  readonly occurredAt: Date;
}

export interface ApplyEvaluationResult {
  readonly ratingState: JobRatingState;
  readonly misconceptions: MisconceptionState[];
  /** Assessed attempt record — append to the job's recent-attempts window. */
  readonly attempt: AttemptRecord;
  readonly prediction: RatingPredictionRecord;
}

/**
 * Fold one evaluated attempt into learner state. Takes the stored rating
 * state, the misconception ledger and the evaluation; produces all updated
 * state plus the prediction record. Throws when check counts are invalid or
 * the item rating is missing/non-finite — both mean an upstream contract broke
 * and the rating must not be corrupted.
 */
export const applyEvaluation = (input: {
  ratingState: JobRatingState;
  misconceptions: readonly MisconceptionState[];
  evaluation: EvaluatedAttempt;
  policy?: RatingPolicy;
}): ApplyEvaluationResult => {
  const policy = input.policy ?? DEFAULT_RATING_POLICY;
  const { evaluation } = input;

  if (!Number.isFinite(evaluation.itemRating)) {
    throw new RangeError(
      "applyEvaluation requires a finite itemRating on the scenario",
    );
  }

  const decayed = decayRatingState(
    input.ratingState,
    evaluation.occurredAt,
    policy,
  );
  const attempt = assessAttempt(evaluation, policy);
  const itemDeviation =
    evaluation.itemRatingDeviation ?? policy.defaultItemRatingDeviation;

  const predictedScore = expectedScore(
    decayed.rating,
    evaluation.itemRating,
    itemDeviation,
  );

  const ratingState = updateRatingState(
    decayed,
    {
      outcome: attempt.outcome,
      itemRating: evaluation.itemRating,
      itemRatingDeviation: itemDeviation,
    },
    evaluation.occurredAt,
    policy,
  );

  const misconceptions = reduceMisconceptions(input.misconceptions, {
    errorCodes: evaluation.errorCodes,
    targetedCode: evaluation.targetedMisconceptionCode,
    cleanPass: attempt.cleanPass,
    occurredAt: evaluation.occurredAt,
  });

  return {
    ratingState,
    misconceptions,
    attempt,
    prediction: {
      ratingBefore: decayed.rating,
      ratingDeviationBefore: decayed.ratingDeviation,
      ratingAfter: ratingState.rating,
      ratingDeviationAfter: ratingState.ratingDeviation,
      itemRating: evaluation.itemRating,
      predictedScore,
      actualOutcome: attempt.outcome,
      occurredAt: evaluation.occurredAt,
    },
  };
};
