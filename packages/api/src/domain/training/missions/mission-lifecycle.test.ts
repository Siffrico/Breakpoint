import { describe, expect, it } from "vitest";

import { isEligibleForMission } from "./mission-lifecycle";

describe("isEligibleForMission", () => {
  it("allows a mastered unit under an ability or a skill cluster", () => {
    for (const kind of ["ability", "skill_cluster"]) {
      expect(
        isEligibleForMission({
          run: { phase: "mastered" },
          parentNode: { kind },
        }),
      ).toBe(true);
    }
  });

  it("rejects a run that has not reached mastery", () => {
    expect(
      isEligibleForMission({
        run: { phase: "solve" },
        parentNode: { kind: "ability" },
      }),
    ).toBe(false);
  });

  it("rejects a mastered unit whose parent does not earn a mission", () => {
    expect(
      isEligibleForMission({
        run: { phase: "mastered" },
        parentNode: { kind: "root" },
      }),
    ).toBe(false);
  });

  it("rejects an orphan unit with no parent node", () => {
    expect(
      isEligibleForMission({ run: { phase: "mastered" }, parentNode: null }),
    ).toBe(false);
  });
});
