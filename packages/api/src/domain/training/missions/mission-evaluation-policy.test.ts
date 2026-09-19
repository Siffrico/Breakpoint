import { describe, expect, it } from "vitest";

import { decideMissionEvaluation } from "./mission-evaluation-policy";

const draft = (checks: [boolean, boolean, boolean]) => ({
  executionMet: checks[0],
  executionFeedback: "Execution feedback",
  evidenceMet: checks[1],
  evidenceFeedback: "Evidence feedback",
  judgmentMet: checks[2],
  judgmentFeedback: "Judgment feedback",
  summary: "Evaluation summary",
  nextStep: "Improve the evidence.",
});

describe("decideMissionEvaluation", () => {
  it("passes proof that meets every mission check", () => {
    const result = decideMissionEvaluation({
      draft: draft([true, true, true]),
      attemptNumber: 1,
    });

    expect(result).toMatchObject({
      checksMet: 3,
      checksTotal: 3,
      passed: true,
      nextStep: null,
    });
  });

  it("does not advance while a mission check remains unmet", () => {
    const result = decideMissionEvaluation({
      draft: draft([true, true, false]),
      attemptNumber: 4,
    });

    expect(result).toMatchObject({ checksMet: 2, passed: false });
  });
});
