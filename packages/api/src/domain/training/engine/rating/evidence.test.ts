import { expect, test } from "vitest";

import { assessAttempt } from "./evidence";

const evidence = {
  bandOrder: 0,
  score: 25,
  offeredSupport: "none" as const,
  sidechatAskCount: 0,
  wasOverTime: false,
  itemRating: 1_000,
  occurredAt: new Date("2026-01-01T00:00:00Z"),
};

test("chance-corrects a four-option MCQ", () => {
  expect(assessAttempt({ ...evidence, guessChance: 0.25 }).outcome).toBe(0);
});

test("leaves FRQ outcomes unchanged", () => {
  expect(assessAttempt(evidence).outcome).toBe(0.25);
});
