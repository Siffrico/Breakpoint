import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  mentorTeachingOutputSchema,
  renderGradeMessage,
  renderPartialGradeMessage,
  reviewGradeSchema,
  reviewPresentationSchema,
} from "./agent-contracts";

describe("mentorTeachingOutputSchema", () => {
  const testedCriterionIds = ["constraint-tradeoff"] as const;
  const opening = {
    assistantMessage: `Name what a sentence does in the argument, then use the next sentence to verify that role.

A study reports that urban trees lowered summer street temperatures. However, the researchers warn that scarce water can limit this benefit during droughts.

The tempting answer says the sentence discusses cooler streets, which only repeats the topic. The stronger answer names its structural job: it presents a finding the passage then limits.

A claim is followed by Nevertheless and an opposing result. What function does the claim serve?`,
    preparedScenario: null,
  };
  const preparedScenario = {
    assistantMessage:
      "A production constraint changed. Choose the safe move and explain the controlling reason.",
    verifier: {
      kind: "checks" as const,
      checks: [
        {
          criterionId: "constraint-tradeoff",
          check: "The answer must derive the move from the changed constraint.",
        },
      ],
      scratchpad:
        "The safe move follows the changed constraint; the trap reuses the old procedure.",
    },
  };

  it("teaches first without creating the scenario", () => {
    expect(
      mentorTeachingOutputSchema(false, false, testedCriterionIds).safeParse({
        ...opening,
      }).success,
    ).toBe(true);
    expect(
      mentorTeachingOutputSchema(false, false, testedCriterionIds).safeParse({
        ...opening,
        preparedScenario,
      }).success,
    ).toBe(false);
  });

  it("lets the mentor organize the lesson as Markdown without punctuation validation", () => {
    expect(
      mentorTeachingOutputSchema(false, false, testedCriterionIds).safeParse({
        ...opening,
        assistantMessage: `**Try this**

- Name the sentence's role.
- Check that role against the next sentence.`,
      }).success,
    ).toBe(true);
  });

  it("does not expose the unused scenario object in the opening JSON schema", () => {
    const openingJsonSchema = z.toJSONSchema(
      mentorTeachingOutputSchema(true, false, testedCriterionIds),
    );

    expect(JSON.stringify(openingJsonSchema)).not.toContain("verifier");
    expect(openingJsonSchema.properties?.preparedScenario).toMatchObject({
      type: "null",
    });
  });

  it("creates the scenario after one answer without validating prose layout", () => {
    expect(
      mentorTeachingOutputSchema(false, true, testedCriterionIds).safeParse({
        assistantMessage:
          "The changed constraint must control the move, not the familiar procedure.",
        preparedScenario,
      }).success,
    ).toBe(true);
    expect(
      mentorTeachingOutputSchema(false, true, testedCriterionIds).safeParse({
        assistantMessage: "Which constraint controls the move?",
        preparedScenario,
      }).success,
    ).toBe(true);
  });
});

const verifier = {
  kind: "fixed_answer" as const,
  answer: "B",
  scratchpad:
    "Solution: B preserves both constraints. Trap A protects the visible metric but breaks consistency. Audit: one answer; self-contained.",
};
const options = [
  { label: "A" as const, text: "Retry every request" },
  { label: "B" as const, text: "Retry only idempotent requests" },
  { label: "C" as const, text: "Never retry" },
  { label: "D" as const, text: "Retry writes without a key" },
] as const;

const selectScenario = {
  stimulus:
    "A signed-in learner sees stale progress after reconnecting. Retries currently fire for every failed request, including writes sent without an idempotency key.",
  assistantMessage: "Which recovery policy should the team ship, and why?",
  options,
  verifier,
} as const;

describe("reviewPresentationSchema", () => {
  const testedCriterionIds = ["constraint-tradeoff"] as const;
  const checksVerifier = {
    kind: "checks" as const,
    checks: [
      {
        criterionId: "constraint-tradeoff",
        check:
          "The answer must explain why only idempotent requests are safe to retry.",
      },
    ],
    scratchpad:
      "The safe move retries only idempotent requests and ties that choice to duplicate-write risk.",
  };

  it("keeps a validated private verifier beside learner-facing scenario text", () => {
    const result = reviewPresentationSchema(true, testedCriterionIds).safeParse(
      selectScenario,
    );

    expect(result.success).toBe(true);
  });

  it("caps private scenario planning so it cannot become an internal essay", () => {
    const result = reviewPresentationSchema(true, testedCriterionIds).safeParse(
      {
        ...selectScenario,
        verifier: {
          ...verifier,
          scratchpad: "x".repeat(601),
        },
      },
    );

    expect(result.success).toBe(false);
  });

  it("rejects a stem that instructs without asking anything", () => {
    const result = reviewPresentationSchema(true, testedCriterionIds).safeParse(
      {
        ...selectScenario,
        assistantMessage:
          "Read the passage above, then run a qualifier audit and be ready to cite the phrase that confirms your choice.",
      },
    );

    expect(result.success).toBe(false);
  });

  it("rejects private authoring fields leaked into the scenario", () => {
    const result = reviewPresentationSchema(
      false,
      testedCriterionIds,
    ).safeParse({
      assistantMessage:
        "The checkerSpec selects option B. Explain why it preserves both constraints.",
      verifier: checksVerifier,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a worked example instead of an unsolved challenge", () => {
    const result = reviewPresentationSchema(
      false,
      testedCriterionIds,
    ).safeParse({
      assistantMessage: `## Worked Example

Which policy should the team ship?

A. Retry every request
B. Retry only idempotent requests
C. Never retry
D. Retry writes without a key

Answer: B`,
      verifier: checksVerifier,
    });

    expect(result.success).toBe(false);
  });

  it("rejects drafting debris in learner-visible options", () => {
    const result = reviewPresentationSchema(true, testedCriterionIds).safeParse(
      {
        ...selectScenario,
        options: [
          options[0],
          {
            label: "B",
            text: "Retry idempotent requests. Hmm, this is the intended trap.",
          },
          options[2],
          options[3],
        ],
        verifier,
      },
    );

    expect(result.success).toBe(false);
  });

  it("rejects a selected-response verifier without learner-visible options", () => {
    const { options: _options, ...withoutOptions } = selectScenario;
    const result = reviewPresentationSchema(true, testedCriterionIds).safeParse(
      withoutOptions,
    );

    expect(result.success).toBe(false);
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
