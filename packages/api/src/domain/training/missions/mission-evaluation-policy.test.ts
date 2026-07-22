import { describe, expect, it } from "vitest";

import {
  decideMissionEvaluation,
  MISSION_GROWTH_DELTA,
} from "./mission-evaluation-policy";

const draft = (scores: [number, number, number]) => ({
  executionScore: scores[0],
  executionFeedback: "Execution feedback",
  evidenceScore: scores[1],
  evidenceFeedback: "Evidence feedback",
  judgmentScore: scores[2],
  judgmentFeedback: "Judgment feedback",
  summary: "Evaluation summary",
  nextStep: "Improve the evidence.",
});

describe("decideMissionEvaluation", () => {
  it("passes proof that reaches the mission standard", () => {
    const result = decideMissionEvaluation({
      draft: draft([30, 25, 15]),
      attemptNumber: 1,
      firstScore: null,
    });

    expect(result).toMatchObject({
      score: 70,
      passed: true,
      growthPass: false,
      nextStep: null,
    });
  });

  it("accepts substantial growth after three revisions", () => {
    const firstScore = 48;
    const result = decideMissionEvaluation({
      draft: draft([25, 20, 13]),
      attemptNumber: 4,
      firstScore,
    });

    expect(result.score - firstScore).toBe(MISSION_GROWTH_DELTA);
    expect(result).toMatchObject({ passed: true, growthPass: true });
  });

  it("never grants a growth pass when a core criterion has no evidence", () => {
    const result = decideMissionEvaluation({
      draft: draft([35, 25, 0]),
      attemptNumber: 4,
      firstScore: 40,
    });

    expect(result).toMatchObject({ passed: false, growthPass: false });
  });
});
