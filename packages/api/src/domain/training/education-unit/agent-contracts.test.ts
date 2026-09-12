import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  getGradePresentationIssue,
  mentorTeachingOutputSchema,
  renderGradeMessage,
  renderPartialGradeMessage,
  reviewGradeSchema,
  reviewPresentationSchema,
} from "./agent-contracts";

describe("mentorTeachingOutputSchema", () => {
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
      type: "judge_rubric" as const,
      answer: null,
      checkerSpec: null,
      scratchpad:
        "The safe move follows the changed constraint; the trap reuses the old procedure.",
    },
  };

  it("teaches first without creating the scenario", () => {
    expect(
      mentorTeachingOutputSchema(false, false).safeParse({
        ...opening,
      }).success,
    ).toBe(true);
    expect(
      mentorTeachingOutputSchema(false, false).safeParse({
        ...opening,
        preparedScenario,
      }).success,
    ).toBe(false);
  });

  it("lets the mentor organize the lesson as Markdown without punctuation validation", () => {
    expect(
      mentorTeachingOutputSchema(false, false).safeParse({
        ...opening,
        assistantMessage: `**Try this**

- Name the sentence's role.
- Check that role against the next sentence.`,
      }).success,
    ).toBe(true);
  });

  it("does not expose the unused scenario object in the opening JSON schema", () => {
    const openingJsonSchema = z.toJSONSchema(
      mentorTeachingOutputSchema(true, false),
    );

    expect(JSON.stringify(openingJsonSchema)).not.toContain("verifier");
    expect(openingJsonSchema.properties?.preparedScenario).toMatchObject({
      type: "null",
    });
  });

  it("creates the scenario after one answer without validating prose layout", () => {
    expect(
      mentorTeachingOutputSchema(false, true).safeParse({
        assistantMessage:
          "The changed constraint must control the move, not the familiar procedure.",
        preparedScenario,
      }).success,
    ).toBe(true);
    expect(
      mentorTeachingOutputSchema(false, true).safeParse({
        assistantMessage: "Which constraint controls the move?",
        preparedScenario,
      }).success,
    ).toBe(true);
  });
});

const verifier = {
  type: "fixed_answer" as const,
  answer: "B",
  checkerSpec: null,
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
  it("keeps a validated private verifier beside learner-facing scenario text", () => {
    const result = reviewPresentationSchema(true).safeParse(selectScenario);

    expect(result.success).toBe(true);
  });

  it("caps private scenario planning so it cannot become an internal essay", () => {
    const result = reviewPresentationSchema(true).safeParse({
      ...selectScenario,
      verifier: {
        ...verifier,
        scratchpad: "x".repeat(601),
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a stem that instructs without asking anything", () => {
    const result = reviewPresentationSchema(true).safeParse({
      ...selectScenario,
      assistantMessage:
        "Read the passage above, then run a qualifier audit and be ready to cite the phrase that confirms your choice.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects private authoring fields leaked into the scenario", () => {
    const result = reviewPresentationSchema(false).safeParse({
      assistantMessage:
        "The checkerSpec selects option B. Explain why it preserves both constraints.",
      verifier,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a worked example instead of an unsolved challenge", () => {
    const result = reviewPresentationSchema(false).safeParse({
      assistantMessage: `## Worked Example

Which policy should the team ship?

A. Retry every request
B. Retry only idempotent requests
C. Never retry
D. Retry writes without a key

Answer: B`,
      verifier,
    });

    expect(result.success).toBe(false);
  });

  it("rejects drafting debris in learner-visible options", () => {
    const result = reviewPresentationSchema(true).safeParse({
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
    });

    expect(result.success).toBe(false);
  });

  it("rejects a selected-response verifier without learner-visible options", () => {
    const { options: _options, ...withoutOptions } = selectScenario;
    const result = reviewPresentationSchema(true).safeParse(withoutOptions);

    expect(result.success).toBe(false);
  });
});

const gradeShape = {
  testedDimensionIds: ["constraint-tradeoff"],
  learnerAnswer:
    "I would keep the original procedure because it is simpler and already proven.",
  evidencesAllTargets: () => true,
} as const;

const weakDimensionResult = {
  dimensionId: "constraint-tradeoff",
  score: 58,
  evidence: "keep the original procedure",
  missing: "A re-derivation from the changed constraint.",
};

const cleanDimensionResult = {
  ...weakDimensionResult,
  score: 96,
  missing: null,
};

const diagnosis = {
  quote: "keep the original procedure because it is simpler",
  hypothesis:
    "I think you read the old procedure being proven as it still being safe.",
  why: [
    "The procedure was safe because the coolant held above 40 degrees.",
    "The new line runs at 30 degrees, so that no longer holds.",
    "Reusing the steps now skips the check that kept them safe.",
  ],
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

  it("requires a hypothesis the learner can push back on", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      ...gappedGrade,
      diagnosis: {
        ...diagnosis,
        hypothesis:
          "You conflated the proven procedure with a safe one, which is wrong.",
      },
    });

    expect(result.success).toBe(false);
  });

  it("keeps every why line short enough to read in one pass", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      ...gappedGrade,
      diagnosis: { ...diagnosis, why: ["x".repeat(121), "A second line."] },
    });

    expect(result.success).toBe(false);
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

  it("treats an unevidenced target as a gap, like the turn does", () => {
    const shape = { ...gradeShape, evidencesAllTargets: () => false };

    expect(reviewGradeSchema(shape).safeParse(cleanGrade).success).toBe(false);
    expect(
      reviewGradeSchema(shape).safeParse({
        ...gappedGrade,
        dimensionResults: [cleanDimensionResult],
      }).success,
    ).toBe(true);
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

The procedure was safe because the coolant held above 40 degrees.

The new line runs at 30 degrees, so that no longer holds.

Reusing the steps now skips the check that kept them safe.`,
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
        diagnosis: { ...diagnosis, why: [diagnosis.why[0]] },
      }),
    ).toBe(
      `> keep the original procedure because it is simpler

I think you read the old procedure being proven as it still being safe.

The procedure was safe because the coolant held above 40 degrees.`,
    );
  });

  it("streams a clean answer's closing message", () => {
    expect(renderPartialGradeMessage({ closingMessage: "Right: you re" })).toBe(
      "Right: you re",
    );
  });
});

describe("getGradePresentationIssue", () => {
  it("passes a diagnosis written in concrete words", () => {
    expect(getGradePresentationIssue(gappedGrade)).toBeNull();
  });

  it("asks again when the learner would have to translate first", () => {
    const issue = getGradePresentationIssue({
      ...gappedGrade,
      diagnosis: {
        ...diagnosis,
        why: [
          "Your assumption about the heuristic does not hold.",
          "The second criterion is unmet.",
        ],
      },
    });

    expect(issue).toContain("assumption");
    expect(issue).toContain("heuristic");
    expect(issue).toContain("criterion");
  });
});
