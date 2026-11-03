import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import type { PartsShape } from "./agent-contracts";
import {
  mentorLessonOutputSchema,
  mentorPartsOutputSchema,
  renderGradeMessage,
  renderPartialGradeMessage,
  renderPartialParts,
  reviewGradeSchema,
} from "./agent-contracts";

describe("mentorLessonOutputSchema", () => {
  it("lets the mentor organize the lesson as Markdown", () => {
    expect(
      mentorLessonOutputSchema.safeParse({
        assistantMessage: `**Try this**

- Name the sentence's role.
- Check that role against the next sentence.`,
      }).success,
    ).toBe(true);
  });

  it("never carries a scenario beside the lesson", () => {
    expect(
      JSON.stringify(z.toJSONSchema(mentorLessonOutputSchema)),
    ).not.toContain("verifier");
  });
});

const openShape = (overrides: Partial<PartsShape> = {}): PartsShape => ({
  selectedResponse: false,
  roundCriterionIds: ["constraint-tradeoff", "consequence-check"],
  partCount: 1,
  mustCoverCriterionIds: [],
  opensRound: true,
  acknowledgesExplanation: false,
  ...overrides,
});

const checksVerifier = (criterionIds: readonly string[]) => ({
  kind: "checks" as const,
  checks: criterionIds.map((criterionId) => ({
    criterionId,
    check: "The answer must explain why only idempotent requests are safe to retry.",
  })),
  scratchpad:
    "The safe move retries only idempotent requests and ties that choice to duplicate-write risk.",
});

const openPart = (criterionIds: readonly string[] = ["constraint-tradeoff"]) => ({
  question: "Which requests is it safe to retry, and why?",
  criterionIds: [...criterionIds],
  verifier: checksVerifier(criterionIds),
});

const narrative =
  "A signed-in learner sees stale progress after reconnecting. Retries fire for every failed request, including writes sent without an idempotency key.";

describe("mentorPartsOutputSchema", () => {
  it("opens a round with its shared situation and one part", () => {
    expect(
      mentorPartsOutputSchema(openShape()).safeParse({
        acknowledgment: null,
        narrative,
        parts: [openPart()],
      }).success,
    ).toBe(true);
  });

  it("requires the situation only when the parts open a round", () => {
    expect(
      mentorPartsOutputSchema(openShape()).safeParse({
        acknowledgment: null,
        narrative: null,
        parts: [openPart()],
      }).success,
    ).toBe(false);
    expect(
      mentorPartsOutputSchema(openShape({ opensRound: false })).safeParse({
        acknowledgment: null,
        narrative,
        parts: [openPart()],
      }).success,
    ).toBe(false);
  });

  it("requires an acknowledgment only after an explain-back", () => {
    const shape = openShape({ acknowledgesExplanation: true });
    expect(
      mentorPartsOutputSchema(shape).safeParse({
        acknowledgment: null,
        narrative,
        parts: [openPart()],
      }).success,
    ).toBe(false);
    expect(
      mentorPartsOutputSchema(shape).safeParse({
        acknowledgment: "Right: the key makes a retry safe.",
        narrative,
        parts: [openPart()],
      }).success,
    ).toBe(true);
  });

  it("writes exactly the requested number of parts", () => {
    expect(
      mentorPartsOutputSchema(openShape({ partCount: 3 })).safeParse({
        acknowledgment: null,
        narrative,
        parts: [openPart()],
      }).success,
    ).toBe(false);
  });

  it("requires the written parts to cover the criteria still untested", () => {
    const shape = openShape({
      partCount: 1,
      mustCoverCriterionIds: ["constraint-tradeoff", "consequence-check"],
    });
    expect(
      mentorPartsOutputSchema(shape).safeParse({
        acknowledgment: null,
        narrative,
        parts: [openPart(["constraint-tradeoff"])],
      }).success,
    ).toBe(false);
    expect(
      mentorPartsOutputSchema(shape).safeParse({
        acknowledgment: null,
        narrative,
        parts: [openPart(["constraint-tradeoff", "consequence-check"])],
      }).success,
    ).toBe(true);
  });

  it("requires one check per criterion the part tests", () => {
    expect(
      mentorPartsOutputSchema(openShape()).safeParse({
        acknowledgment: null,
        narrative,
        parts: [
          {
            ...openPart(["constraint-tradeoff", "consequence-check"]),
            verifier: checksVerifier(["constraint-tradeoff"]),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a criterion outside the round", () => {
    expect(
      mentorPartsOutputSchema(openShape()).safeParse({
        acknowledgment: null,
        narrative,
        parts: [openPart(["elsewhere"])],
      }).success,
    ).toBe(false);
  });

  it("rejects private authoring fields leaked into a part", () => {
    expect(
      mentorPartsOutputSchema(openShape()).safeParse({
        acknowledgment: null,
        narrative,
        parts: [
          {
            ...openPart(),
            question:
              "The checkerSpec selects option B. Explain why it preserves both constraints.",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a worked solution in place of an unsolved part", () => {
    expect(
      mentorPartsOutputSchema(openShape()).safeParse({
        acknowledgment: null,
        narrative,
        parts: [{ ...openPart(), question: "Which requests are safe? Answer: B" }],
      }).success,
    ).toBe(false);
  });

  describe("selected response", () => {
    const shape = openShape({
      selectedResponse: true,
      roundCriterionIds: ["constraint-tradeoff"],
    });
    const options = [
      { label: "A" as const, text: "Retry every request" },
      { label: "B" as const, text: "Retry only idempotent requests" },
      { label: "C" as const, text: "Never retry" },
      { label: "D" as const, text: "Retry writes without a key" },
    ];
    const selectPart = {
      stimulus: null,
      question: "Which recovery policy should the team ship?",
      options,
      criterionIds: ["constraint-tradeoff"],
      verifier: {
        kind: "fixed_answer" as const,
        answer: "B" as const,
        scratchpad:
          "Solution: B preserves both constraints. Trap A protects the visible metric but breaks consistency.",
      },
    };

    it("accepts a part with four options and a fixed answer", () => {
      expect(
        mentorPartsOutputSchema(shape).safeParse({
          acknowledgment: null,
          narrative,
          parts: [selectPart],
        }).success,
      ).toBe(true);
    });

    it("rejects a stem that instructs without asking anything", () => {
      expect(
        mentorPartsOutputSchema(shape).safeParse({
          acknowledgment: null,
          narrative,
          parts: [
            {
              ...selectPart,
              question:
                "Read the passage above, then run a qualifier audit and be ready to cite the phrase.",
            },
          ],
        }).success,
      ).toBe(false);
    });

    it("rejects drafting debris in the options", () => {
      expect(
        mentorPartsOutputSchema(shape).safeParse({
          acknowledgment: null,
          narrative,
          parts: [
            {
              ...selectPart,
              options: [
                options[0],
                { label: "B", text: "Retry idempotent requests. Hmm, the trap." },
                options[2],
                options[3],
              ],
            },
          ],
        }).success,
      ).toBe(false);
    });
  });
});

describe("renderPartialParts", () => {
  it("streams the acknowledgment, situation, and labeled parts as they arrive", () => {
    expect(
      renderPartialParts(1)({
        acknowledgment: "Good read.",
        narrative: "A line runs at 30 degrees.",
        parts: [{ question: "What changes?" }],
      }),
    ).toBe("Good read.\n\nA line runs at 30 degrees.\n\n**Part (b)**\n\nWhat changes?");
  });
});

const gradeShape = {
  testedDimensionIds: ["constraint-tradeoff"],
  learnerAnswer:
    "I would keep the original procedure because it is simpler and already proven.",
} as const;

const weakDimensionResult = {
  dimensionId: "constraint-tradeoff",
  met: false,
  evidence: "keep the original procedure",
  missing: "A re-derivation from the changed constraint.",
};

const cleanDimensionResult = {
  ...weakDimensionResult,
  met: true,
  missing: null,
};

const diagnosis = {
  quote: "keep the original procedure because it is simpler",
  hypothesis:
    "I think you read the old procedure being proven as it still being safe.",
  explanation:
    "The procedure was safe because the coolant held above 40 degrees. The new line runs at 30 degrees, so that no longer holds. Reusing the steps now skips the check that kept them safe.",
};

const gappedGrade = {
  closingMessage: null,
  diagnosis,
  causeType: "missed-limit" as const,
  errorCodes: ["missed-controlling-constraint"],
  scratchpad:
    "Optimized for simplicity. Read proven as safe. Cause: the changed coolant limit was never taken into account.",
  dimensionResults: [weakDimensionResult],
};

const cleanGrade = {
  closingMessage:
    "Right: you re-derived the procedure from the coolant limit instead of reusing it, which is what the changed line needed.",
  diagnosis: null,
  causeType: null,
  errorCodes: [],
  scratchpad:
    "No material divergence: the learner re-derived from the controlling constraint.",
  dimensionResults: [cleanDimensionResult],
};

describe("reviewGradeSchema", () => {
  it("requires every tool property", () => {
    const json = z.toJSONSchema(reviewGradeSchema(gradeShape));
    expect(json.required).toEqual(Object.keys(json.properties ?? {}));
  });

  it("requires results for an undecided verdict", () => {
    expect(
      reviewGradeSchema(gradeShape).safeParse({
        ...gappedGrade,
        dimensionResults: null,
      }).success,
    ).toBe(false);
    const { dimensionResults: _results, ...withoutResults } = gappedGrade;
    expect(
      reviewGradeSchema(gradeShape).safeParse(withoutResults).success,
    ).toBe(false);
  });

  it("accepts a diagnosis written as fields", () => {
    expect(reviewGradeSchema(gradeShape).safeParse(gappedGrade).success).toBe(
      true,
    );
  });

  it("accepts a clean grade that closes without a diagnosis", () => {
    expect(reviewGradeSchema(gradeShape).safeParse(cleanGrade).success).toBe(
      true,
    );
  });

  it("accepts tentative wording without requiring an exact opening", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      ...gappedGrade,
      diagnosis: {
        ...diagnosis,
        hypothesis:
          "My read is that you treated the proven procedure as still safe.",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a diagnosis quote that is not in the learner answer", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      ...gappedGrade,
      diagnosis: { ...diagnosis, quote: "A" },
    });

    expect(result.success).toBe(false);
  });

  it("does not require a minimum amount of private reasoning prose", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      ...gappedGrade,
      scratchpad: "Enough.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a gap that names nothing", () => {
    for (const missing of [
      { diagnosis: null },
      { causeType: null },
      { errorCodes: [] },
      { closingMessage: "Nice work." },
    ]) {
      expect(
        reviewGradeSchema(gradeShape).safeParse({ ...gappedGrade, ...missing })
          .success,
      ).toBe(false);
    }
  });

  it("rejects a flaw invented on a clean answer", () => {
    for (const residue of [
      { diagnosis },
      { causeType: "wrong-rule" as const },
      { errorCodes: ["stale-diagnosis"] },
      { closingMessage: null },
    ]) {
      expect(
        reviewGradeSchema(gradeShape).safeParse({ ...cleanGrade, ...residue })
          .success,
      ).toBe(false);
    }
  });

  it("rejects criterion evidence that is not in the learner answer", () => {
    expect(
      reviewGradeSchema(gradeShape).safeParse({
        ...gappedGrade,
        dimensionResults: [
          { ...weakDimensionResult, evidence: "a sentence never written" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects error codes that would key a second ledger row", () => {
    expect(
      reviewGradeSchema(gradeShape).safeParse({
        ...gappedGrade,
        errorCodes: ["Missed Controlling Constraint"],
      }).success,
    ).toBe(false);
  });

  it("rejects an oversized private scratchpad", () => {
    expect(
      reviewGradeSchema(gradeShape).safeParse({
        ...gappedGrade,
        scratchpad: "x".repeat(601),
      }).success,
    ).toBe(false);
  });

  it("never lets private authoring data reach the learner", () => {
    expect(
      reviewGradeSchema(gradeShape).safeParse({
        ...cleanGrade,
        closingMessage: "Right: the verifier.answer confirms option B.",
      }).success,
    ).toBe(false);
  });
});

describe("an unanswered part", () => {
  const unanswered = {
    ...gappedGrade,
    diagnosis: { ...diagnosis, quote: null },
    dimensionResults: [{ ...weakDimensionResult, evidence: null }],
  };

  it("grades a missing answer with null evidence and no quote", () => {
    expect(reviewGradeSchema(gradeShape).safeParse(unanswered).success).toBe(
      true,
    );
    expect(renderGradeMessage(unanswered)).not.toContain(">");
  });

  it("never lets a check pass without evidence", () => {
    expect(
      reviewGradeSchema(gradeShape).safeParse({
        ...cleanGrade,
        dimensionResults: [{ ...cleanDimensionResult, evidence: null }],
      }).success,
    ).toBe(false);
  });
});

describe("renderGradeMessage", () => {
  it("lays the diagnosis out so the critic never chooses a shape", () => {
    expect(renderGradeMessage(gappedGrade)).toBe(
      `> keep the original procedure because it is simpler

I think you read the old procedure being proven as it still being safe.

The procedure was safe because the coolant held above 40 degrees. The new line runs at 30 degrees, so that no longer holds. Reusing the steps now skips the check that kept them safe.`,
    );
  });

  it("shows the closing message on its own when there is no gap", () => {
    expect(renderGradeMessage(cleanGrade)).toBe(cleanGrade.closingMessage);
  });
});

describe("renderPartialGradeMessage", () => {
  it("streams the diagnosis as its fields arrive", () => {
    expect(renderPartialGradeMessage({})).toBeUndefined();
    expect(
      renderPartialGradeMessage({ diagnosis: { quote: "keep the orig" } }),
    ).toBe("> keep the orig");
    expect(
      renderPartialGradeMessage({
        diagnosis,
      }),
    ).toBe(
      `> keep the original procedure because it is simpler

I think you read the old procedure being proven as it still being safe.

The procedure was safe because the coolant held above 40 degrees. The new line runs at 30 degrees, so that no longer holds. Reusing the steps now skips the check that kept them safe.`,
    );
  });

  it("streams a clean answer's closing message", () => {
    expect(renderPartialGradeMessage({ closingMessage: "Right: you re" })).toBe(
      "Right: you re",
    );
  });
});
