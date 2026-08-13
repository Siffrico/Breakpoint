import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  mentorTeachingOutputSchema,
  renderMentorOpening,
  reviewFeedbackSchema,
  reviewGradeSchema,
  reviewPresentationSchema,
} from "./agent-contracts";

describe("mentorTeachingOutputSchema", () => {
  const opening = {
    heuristic:
      "Name what the sentence does in the argument, then use the next sentence to verify that role.",
    workedExample: {
      read: "A study reports that urban trees lowered summer street temperatures. However, the researchers warn that scarce water can limit this benefit during severe droughts.",
      predict:
        "The first sentence establishes the positive result that the next sentence qualifies.",
      compare:
        "A tempting answer merely says the sentence discusses cooler streets. That repeats the topic. The stronger answer names its structural job: it presents a finding before the passage introduces a limit.",
      decide:
        "Choose the function answer because However confirms that the second sentence pivots away from an unqualified benefit.",
    },
    check:
      "A claim is followed by Nevertheless and an opposing result. What function does the claim serve?",
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

  it("renders the opening with product-owned semantic structure", () => {
    expect(renderMentorOpening(opening)).toBe(`## Heuristic

${opening.heuristic}

## Worked example

### Read

${opening.workedExample.read}

### Predict

${opening.workedExample.predict}

### Compare

${opening.workedExample.compare}

### Decide

${opening.workedExample.decide}

## Check

${opening.check}`);
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

  it("creates the scenario after one answer and asks no second question", () => {
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
    ).toBe(false);
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

describe("reviewPresentationSchema", () => {
  it("keeps a validated private verifier beside learner-facing scenario text", () => {
    const result = reviewPresentationSchema(true).safeParse({
      assistantMessage:
        "A signed-in learner sees stale progress after reconnecting. Which recovery policy should the team ship, and why?",
      options,
      verifier,
    });

    expect(result.success).toBe(true);
  });

  it("caps private scenario planning so it cannot become an internal essay", () => {
    const result = reviewPresentationSchema(true).safeParse({
      assistantMessage:
        "A signed-in learner sees stale progress after reconnecting. Which recovery policy should the team ship, and why?",
      options,
      verifier: {
        ...verifier,
        scratchpad: "x".repeat(601),
      },
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

  it("rejects a selected-response verifier without learner-visible options", () => {
    const result = reviewPresentationSchema(true).safeParse({
      assistantMessage:
        "A signed-in learner sees stale progress after reconnecting. Which recovery policy should the team ship, and why?",
      verifier,
    });

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

  it("closes failed one-shot checkpoints without opening feedback", () => {
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
    ).toBe(false);
  });

  it("rejects vague named-template feedback", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "The Mirror: you chose simplicity. The Pivot: reconsider the constraint. The Crucible: which step changes?",
      errorCodes: ["missed-controlling-constraint"],
      scratchpad:
        "Optimized for simplicity. Hidden assumption: the old safety condition still holds. JIT: re-derive the heuristic.",
      dimensionResults: [weakDimensionResult],
    });

    expect(result.success).toBe(false);
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

  it("rejects repair sections when the answer is clean", () => {
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

    expect(result.success).toBe(false);
  });

  it("requires diagnostic codes and a concrete missing element for a gap", () => {
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

    expect(result.success).toBe(false);
  });

  it("rejects diagnostic residue on a clean answer", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "Exactly right: the changed constraint invalidates the old safety condition.",
      errorCodes: ["stale-diagnosis"],
      scratchpad:
        "No material divergence: the learner re-derived from the controlling constraint.",
      dimensionResults: [{ ...weakDimensionResult, score: 96, missing: null }],
    });

    expect(result.success).toBe(false);
  });
});

describe("reviewFeedbackSchema", () => {
  it("keeps feedback active only when it ends in one question", () => {
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
    ).toBe(false);
  });

  it("forces the third feedback answer to close without another question", () => {
    expect(
      reviewFeedbackSchema(3).safeParse({
        assistantMessage:
          "Focus on the changed limit before reusing the familiar procedure.",
        feedbackComplete: true,
        scratchpad: "Close at the bounded feedback limit.",
      }).success,
    ).toBe(true);
    expect(
      reviewFeedbackSchema(3).safeParse({
        assistantMessage: "Which changed limit controls the move?",
        feedbackComplete: false,
        scratchpad: "The gap remains after the third answer.",
      }).success,
    ).toBe(false);
  });
});
