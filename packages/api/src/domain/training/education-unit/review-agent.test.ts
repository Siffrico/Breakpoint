import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";

const gradeOutput = {
  assistantMessage:
    "Your decision follows the changed constraint and checks its consequence.",
  errorCodes: [],
  scratchpad: "No material divergence exists in the learner's causal path.",
  dimensionResults: [
    {
      dimensionId: "criterion-1",
      score: 92,
      evidence: "I would choose B",
      missing: null,
    },
  ],
};
const runUnitAgentMock = vi.fn((input: unknown) => {
  void input;
  return Effect.succeed({ object: gradeOutput });
});

vi.mock("./run-unit-agent", () => ({
  runUnitAgent: (input: unknown) => runUnitAgentMock(input),
}));

const { runReviewGradeAgent } = await import("./review-agent");

describe("runReviewGradeAgent", () => {
  it("gives the grader the persisted private verifier", async () => {
    await Effect.runPromise(
      runReviewGradeAgent({
        messages: [{ role: "user", content: "I would choose B because..." }],
        context: "Authoritative unit judgment context.",
        activeChallenge: {
          prompt:
            "Choose A or B and defend the choice under the new constraint.",
          difficultyVector: {
            formatId: "selected-response",
            reasoningPathSteps: 2,
            withheldGivens: 0,
            embeddedAlternatives: 1,
          },
          contract: {
            version: 1,
            runKind: "education",
            scenarioPromptSummary: "Choose and defend A or B.",
            testedCriterionIds: ["criterion-1"],
            verifier: {
              type: "fixed_answer",
              answer: "B",
              checkerSpec: null,
              scratchpad:
                "Solution: B follows the changed constraint. A preserves the old constraint. Audit: self-contained and answer hidden.",
            },
          },
        },
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        shape: {
          testedDimensionIds: ["criterion-1"],
          learnerAnswer: "I would choose B because...",
          evidencesAllTargets: () => true,
        },
        priorErrorCodes: ["constraint-blindness"],
      }),
    );

    const call = runUnitAgentMock.mock.calls[0]?.[0] as
      | { context: string }
      | undefined;
    expect(call?.context).toContain(
      "Immutable active challenge and private verifier",
    );
    expect(call?.context).toContain('"answer":"B"');
    expect(call?.context).toContain("B follows the changed constraint");
    expect(call?.context).toContain("constraint-blindness");
    expect(call).not.toHaveProperty("checkPresentation");
  });
});
