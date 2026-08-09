import { describe, expect, it } from "vitest";

import { isEligibleForMission } from "./mission-lifecycle";

describe("isEligibleForMission", () => {
  it("allows a mastered unit under an outcome", () => {
    expect(
      isEligibleForMission({
        run: { mode: "complete" },
        parentNode: { kind: "outcome" },
      }),
    ).toBe(true);
  });

  it("rejects a run that has not reached mastery", () => {
    expect(
      isEligibleForMission({
        run: { mode: "review" },
        parentNode: { kind: "outcome" },
      }),
    ).toBe(false);
  });

  it("rejects a mastered unit whose parent does not earn a mission", () => {
    expect(
      isEligibleForMission({
        run: { mode: "complete" },
        parentNode: { kind: "root" },
      }),
    ).toBe(false);
  });

  it("rejects an orphan unit with no parent node", () => {
    expect(
      isEligibleForMission({ run: { mode: "complete" }, parentNode: null }),
    ).toBe(false);
  });
});
