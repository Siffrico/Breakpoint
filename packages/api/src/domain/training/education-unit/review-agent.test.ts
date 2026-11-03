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
      met: true,
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
  it("grades one part against its private verifier", async () => {
    await Effect.runPromise(
      runReviewGradeAgent({
        learnerAnswer: "(a) I would choose B because... (b) ...",
        context: "Authoritative unit judgment context.",
        part: {
          question: "Choose A or B and defend the choice under the new constraint.",
          criterionIds: ["criterion-1"],
          verifier: {
            kind: "fixed_answer",
            answer: "B",
            scratchpad:
              "Solution: B follows the changed constraint. A preserves the old constraint.",
          },
        },
        letter: "a",
        answersSeveralParts: true,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        priorErrorCodes: ["constraint-blindness"],
      }),
    );

    const call = runUnitAgentMock.mock.calls[0]?.[0] as
      | { context: string; messages: { content: string }[] }
      | undefined;
    expect(call?.context).toContain("## Part (a) and its private verifier");
    expect(call?.context).toContain('"answer":"B"');
    expect(call?.context).toContain("B follows the changed constraint");
    expect(call?.context).toContain("constraint-blindness");
    expect(call?.context).toContain("Judge only their response to part (a)");
    expect(call?.messages[0]?.content).toContain("(a) I would choose B");
    expect(call).not.toHaveProperty("checkPresentation");
  });
});
