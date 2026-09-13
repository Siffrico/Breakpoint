import { describe, expect, it } from "vitest";

import { assertCriterionEvidence, transitionRecallTask } from "./state";

describe("recall task state", () => {
  it("implements every successful transition", () => {
    expect(transitionRecallTask("preparing", { type: "scenario_saved" })).toBe(
      "ready",
    );
    expect(transitionRecallTask("ready", { type: "started" })).toBe(
      "retrieving",
    );
    expect(
      transitionRecallTask("retrieving", {
        type: "retrieval_graded",
        passed: true,
      }),
    ).toBe("complete");
    expect(
      transitionRecallTask("retrieving", {
        type: "retrieval_graded",
        passed: false,
      }),
    ).toBe("correcting");
    expect(
      transitionRecallTask("correcting", {
        type: "correction_graded",
        passed: false,
      }),
    ).toBe("correcting");
    expect(
      transitionRecallTask("correcting", {
        type: "correction_graded",
        passed: true,
      }),
    ).toBe("complete");
  });

  it("rejects transitions that skip the workflow", () => {
    expect(() =>
      transitionRecallTask("ready", {
        type: "retrieval_graded",
        passed: true,
      }),
    ).toThrow("invalid while task is ready");
  });

  it("requires exact assigned criterion coverage", () => {
    expect(() =>
      assertCriterionEvidence({
        criterionIds: ["mechanism"],
        evidenceIds: ["unrelated"],
      }),
    ).toThrow("each assigned criterion once");
    expect(() =>
      assertCriterionEvidence({
        criterionIds: ["mechanism"],
        evidenceIds: ["mechanism"],
      }),
    ).not.toThrow();
  });
});
