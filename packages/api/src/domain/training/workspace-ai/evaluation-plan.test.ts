import { describe, expect, it } from "vitest";

import { deriveServerAttemptTiming } from "./evaluation-plan";

describe("deriveServerAttemptTiming", () => {
  it("derives all decision fields from server timestamps", () => {
    expect(
      deriveServerAttemptTiming({
        presentedAt: new Date("2026-06-27T12:00:00.000Z"),
        submittedAt: new Date("2026-06-27T12:01:10.900Z"),
        timeLimitSeconds: 60,
      }),
    ).toEqual({
      elapsedSeconds: 70,
      timeLimitSeconds: 60,
      overrunSeconds: 10,
      wasOverTime: true,
    });
  });

  it("returns null when a legacy scenario has no presentation timestamp", () => {
    expect(
      deriveServerAttemptTiming({
        presentedAt: null,
        submittedAt: new Date("2026-06-27T12:01:10.900Z"),
        timeLimitSeconds: 60,
      }),
    ).toBeNull();
  });
});
