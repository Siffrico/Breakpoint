import { describe, expect, it } from "vitest";

import {
  mentorOutputSchema,
  reviewGradeSchema,
  reviewPresentationSchema,
} from "./agent-contracts";

describe("mentorOutputSchema", () => {
  it("accepts a causal teachback pass with a concise acknowledgement", () => {
    expect(
      mentorOutputSchema().safeParse({
        assistantMessage:
          "Yes—the changed constraint controls the choice, so the old procedure must be re-derived.",
        teachbackPassed: true,
      }).success,
    ).toBe(true);
  });

  it("requires an incomplete teachback to end in one visible question", () => {
    expect(
      mentorOutputSchema().safeParse({
        assistantMessage:
          "You named the move but not what makes it valid in this case.",
        teachbackPassed: false,
      }).success,
    ).toBe(false);
    expect(
      mentorOutputSchema().safeParse({
        assistantMessage:
          "You named the move but not what makes it valid. Which constraint controls it?",
        teachbackPassed: false,
      }).success,
    ).toBe(true);
    expect(
      mentorOutputSchema().safeParse({
        assistantMessage:
          "Which constraint changed? Why does that invalidate the old move?",
        teachbackPassed: false,
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
Re-derive a heuristic when the constraint that made it safe changes.`,
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
