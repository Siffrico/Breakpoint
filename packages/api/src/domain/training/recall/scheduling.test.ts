import { describe, expect, it } from "vitest";

import {
  recallDueAt,
  scheduleCorrectionComplete,
  scheduleRetrievalResult,
} from "./scheduling";

const now = new Date("2026-09-12T12:00:00.000Z");

describe("recall scheduling", () => {
  it.each([
    [0, "2026-09-15T12:00:00.000Z"],
    [1, "2026-09-19T12:00:00.000Z"],
    [2, "2026-10-03T12:00:00.000Z"],
    [3, "2026-11-11T12:00:00.000Z"],
    [8, "2026-11-11T12:00:00.000Z"],
  ])("maps strength %i to its exact due time", (strength, expected) => {
    expect(recallDueAt(strength, now).toISOString()).toBe(expected);
  });

  it("increments an unassisted pass once and uses the new rung", () => {
    expect(scheduleRetrievalResult({ strength: 0, passed: true, now })).toEqual(
      {
        kind: "retrieval_pass",
        strength: 1,
        lastReinforcedAt: now,
        reviewDueAt: new Date("2026-09-19T12:00:00.000Z"),
      },
    );
  });

  it("reduces only on the retrieval miss and correction keeps that strength", () => {
    const miss = scheduleRetrievalResult({ strength: 2, passed: false, now });
    expect(miss).toMatchObject({ strength: 1, reviewDueAt: null });
    const correctedAt = new Date("2026-09-12T12:05:00.000Z");
    expect(
      scheduleCorrectionComplete({
        reducedStrength: miss.strength,
        now: correctedAt,
      }),
    ).toMatchObject({
      kind: "correction_complete",
      strength: 1,
      reviewDueAt: new Date("2026-09-19T12:05:00.000Z"),
    });
  });
});
