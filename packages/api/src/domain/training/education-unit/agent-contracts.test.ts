import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  mentorTeachingOutputSchema,
  reviewFeedbackSchema,
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
  interactiveFeedback: true,
} as const;

const weakDimensionResult = {
  dimensionId: "constraint-tradeoff",
  score: 58,
  evidence: "keep the original procedure",
  missing: "A re-derivation from the changed constraint.",
};

describe("reviewGradeSchema cognitive scratchpad", () => {
  it("accepts one concise private scratchpad and organized gap feedback", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage: `**What held**
Keeping the proven procedure protects simplicity while its safety conditions hold.

**Change**
You assumed the new constraint does not change the controlling failure mode.

**Use next time**
Re-derive a heuristic when the constraint that made it safe changes. Which constraint must you inspect first?`,
      errorCodes: ["missed-controlling-constraint"],
      scratchpad:
        "Optimized for simplicity. Assumed the old safety condition still holds. Cause: constraint blindness. JIT: re-derive when its controlling constraint changes.",
      dimensionResults: [weakDimensionResult],
    });

    expect(result.success).toBe(true);
  });

  it("accepts selected-response evidence without requiring a verbatim quote", () => {
    const result = reviewGradeSchema({
      ...gradeShape,
      learnerAnswer: "B",
    }).safeParse({
      assistantMessage: "Option B misses the changed constraint.",
      errorCodes: ["missed-controlling-constraint"],
      scratchpad: "The selected option applies the old constraint.",
      dimensionResults: [
        { ...weakDimensionResult, evidence: "The wording of option B" },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an oversized cognitive scratchpad", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "The old procedure protects simplicity, but the new constraint changes its safety condition. Which step becomes unsafe first?",
      errorCodes: ["missed-controlling-constraint"],
      scratchpad: "x".repeat(601),
      dimensionResults: [weakDimensionResult],
    });

    expect(result.success).toBe(false);
  });

  it("accepts one-shot feedback without enforcing punctuation in the schema", () => {
    const oneShotShape = { ...gradeShape, interactiveFeedback: false };
    const result = reviewGradeSchema(oneShotShape).safeParse({
      assistantMessage: `**What held**
Keeping the proven procedure protects simplicity while its conditions hold.

**Change**
The changed constraint invalidates the old safety condition.

**Use next time**
Re-derive the move from the controlling constraint.`,
      errorCodes: ["missed-controlling-constraint"],
      scratchpad:
        "The learner preserved simplicity but missed the changed safety condition.",
      dimensionResults: [weakDimensionResult],
    });
    expect(result.success).toBe(true);
    expect(
      reviewGradeSchema(oneShotShape).safeParse({
        ...(result.success ? result.data : {}),
        assistantMessage: "Which constraint controls the move?",
      }).success,
    ).toBe(true);
  });

  it("accepts learner-facing Markdown without policing section names", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "The Mirror: you chose simplicity. The Pivot: reconsider the constraint. The Crucible: which step changes?",
      errorCodes: ["missed-controlling-constraint"],
      scratchpad:
        "Optimized for simplicity. Hidden assumption: the old safety condition still holds. JIT: re-derive the heuristic.",
      dimensionResults: [weakDimensionResult],
    });

    expect(result.success).toBe(true);
  });

  it("accepts concise clean feedback without repair sections", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "Exactly right: the changed constraint invalidates the old safety condition, so you re-derived the procedure at the correct fork.",
      errorCodes: [],
      scratchpad:
        "No material divergence: the learner re-derived from the controlling constraint.",
      dimensionResults: [
        {
          ...weakDimensionResult,
          score: 96,
          missing: null,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("does not reject a valid clean grade because of its prose layout", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "**What held** Your reasoning was correct. **Change** Nothing. **Use next time** Keep going.",
      errorCodes: [],
      scratchpad:
        "No material divergence: the learner re-derived from the controlling constraint.",
      dimensionResults: [
        {
          ...weakDimensionResult,
          score: 96,
          missing: null,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("lets the workflow derive missing diagnostic codes from scores", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage: `**What held**
The familiar procedure protects simplicity.

**Change**
The changed constraint invalidates its safety condition.

**Use next time**
Re-derive the move from the controlling constraint.`,
      errorCodes: [],
      scratchpad:
        "The learner preserved simplicity but missed the changed safety condition.",
      dimensionResults: [{ ...weakDimensionResult, missing: null }],
    });

    expect(result.success).toBe(true);
  });

  it("lets the workflow discard diagnostic residue on a clean answer", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "Exactly right: the changed constraint invalidates the old safety condition.",
      errorCodes: ["stale-diagnosis"],
      scratchpad:
        "No material divergence: the learner re-derived from the controlling constraint.",
      dimensionResults: [{ ...weakDimensionResult, score: 96, missing: null }],
    });

    expect(result.success).toBe(true);
  });
});

describe("reviewFeedbackSchema", () => {
  it("keeps feedback state independent of prose punctuation", () => {
    expect(
      reviewFeedbackSchema(1).safeParse({
        assistantMessage:
          "The old procedure still controls your answer. Which changed limit makes it unsafe?",
        feedbackComplete: false,
        scratchpad: "The learner still relies on the old procedure.",
      }).success,
    ).toBe(true);
    expect(
      reviewFeedbackSchema(1).safeParse({
        assistantMessage: "The old procedure still controls your answer.",
        feedbackComplete: false,
        scratchpad: "The learner still relies on the old procedure.",
      }).success,
    ).toBe(true);
  });

  it("forces the third feedback answer closed as a state invariant", () => {
    const result = reviewFeedbackSchema(3).safeParse({
      assistantMessage: "Which changed limit controls the move?",
      feedbackComplete: false,
      scratchpad: "The gap remains after the third answer.",
    });

    expect(result).toMatchObject({
      success: true,
      data: { feedbackComplete: true },
    });
    expect(
      reviewFeedbackSchema(3).safeParse({
        assistantMessage:
          "Focus on the changed limit before reusing the familiar procedure.",
        feedbackComplete: true,
        scratchpad: "Close at the bounded feedback limit.",
      }).success,
    ).toBe(true);
  });
});
