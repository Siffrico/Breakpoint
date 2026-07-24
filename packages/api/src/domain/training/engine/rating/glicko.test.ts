import { describe, expect, it } from "vitest";

import type { JobRatingState } from "./glicko";
import {
  createInitialRatingState,
  expectedScore,
  targetItemRating,
  updateRatingState,
} from "./glicko";
import { DEFAULT_RATING_POLICY } from "./policy";

const NOW = new Date("2026-07-24T00:00:00Z");

/** A flawless attempt against an item pitched at the Goldilocks sweet spot. */
const perfectAttemptAt = (rating: number) => ({
  outcome: 1,
  itemRating: targetItemRating(rating),
});

describe("targetItemRating", () => {
  it("inverts expectedScore exactly, deviation included", () => {
    const rating = 1200;
    const deviation = DEFAULT_RATING_POLICY.defaultItemRatingDeviation;
    expect(
      expectedScore(
        rating,
        targetItemRating(rating, 0.7, deviation),
        deviation,
      ),
    ).toBeCloseTo(0.7, 10);
  });
});

describe("updateRatingState", () => {
  it("moves far on the same evidence when it knows little, and little when it knows a lot", () => {
    const unknown = createInitialRatingState();
    const settled = { ...unknown, ratingDeviation: 60, lastRatedAt: NOW };

    const unknownStep =
      updateRatingState(unknown, perfectAttemptAt(1000), NOW).rating -
      unknown.rating;
    const settledStep =
      updateRatingState(settled, perfectAttemptAt(1000), NOW).rating -
      settled.rating;

    // Not a defect to be capped: this IS the estimator. One strong result
    // should move an unknown learner a long way and a well-measured one barely
    // at all. Pacing is the band ladder's job, length is the rep gate's.
    expect(unknownStep).toBeGreaterThan(settledStep * 5);
  });

  it("grows more certain with every attempt, win or lose", () => {
    const fresh = createInitialRatingState();
    for (const outcome of [1, 0]) {
      expect(
        updateRatingState(fresh, { ...perfectAttemptAt(1000), outcome }, NOW)
          .ratingDeviation,
      ).toBeLessThan(fresh.ratingDeviation);
    }
  });

  it("never lets deviation fall below the policy floor", () => {
    let state: JobRatingState = {
      ...createInitialRatingState(),
      lastRatedAt: NOW,
    };
    for (let attempt = 0; attempt < 200; attempt++) {
      state = updateRatingState(state, perfectAttemptAt(state.rating), NOW);
    }
    expect(state.ratingDeviation).toBeGreaterThanOrEqual(
      DEFAULT_RATING_POLICY.minRatingDeviation,
    );
  });

  it("rejects an outcome outside [0,1] rather than corrupting the rating", () => {
    expect(() =>
      updateRatingState(
        createInitialRatingState(),
        { ...perfectAttemptAt(1000), outcome: 1.5 },
        NOW,
      ),
    ).toThrow(RangeError);
  });
});
