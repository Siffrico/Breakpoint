import { describe, expect, it } from "vitest";

import {
  mentorOutputSchema,
  reviewGradeSchema,
  reviewPresentationSchema,
} from "./agent-contracts";

describe("mentorOutputSchema", () => {
  it("rejects an incomplete turn that leaves the learner with no ask", () => {
    const result = mentorOutputSchema("capability-1").safeParse({
      assistantMessage:
        "That part is correct. I will note it and move us forward now.",
      completedCapabilityId: null,
    });

    expect(result.success).toBe(false);
  });

  it("accepts a focused question while the capability remains incomplete", () => {
    const result = mentorOutputSchema("capability-1").safeParse({
      assistantMessage:
        "The state transition is still ambiguous. What durable fact makes the UI claim true?",
      completedCapabilityId: null,
    });

    expect(result.success).toBe(true);
  });
});

const verifier = {
  type: "fixed_answer" as const,
  answer: "B",
  checkerSpec: null,
  scratchpad:
    "Solution: B preserves both constraints. Trap A protects the visible metric but breaks consistency. Audit: one answer; self-contained.",
};

describe("reviewPresentationSchema", () => {
  it("keeps a validated private verifier beside learner-facing scenario text", () => {
    const result = reviewPresentationSchema.safeParse({
      assistantMessage: `A signed-in learner sees stale progress after reconnecting. Which recovery policy should the team ship, and why?

A. Retry every request
B. Retry only idempotent requests
C. Never retry
D. Retry writes without a key`,
      verifier,
    });

    expect(result.success).toBe(true);
  });

  it("caps private scenario planning so it cannot become an internal essay", () => {
    const result = reviewPresentationSchema.safeParse({
      assistantMessage: `A signed-in learner sees stale progress after reconnecting. Which recovery policy should the team ship, and why?

A. Retry every request
B. Retry only idempotent requests
C. Never retry
D. Retry writes without a key`,
      verifier: {
        ...verifier,
        scratchpad: "x".repeat(601),
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects private authoring fields leaked into the scenario", () => {
    const result = reviewPresentationSchema.safeParse({
      assistantMessage:
        "The checkerSpec selects option B. Explain why it preserves both constraints.",
      verifier,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a worked example instead of an unsolved challenge", () => {
    const result = reviewPresentationSchema.safeParse({
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
});

const gradeShape = {
  testedDimensionIds: ["constraint-tradeoff"],
  learnerAnswer:
    "I would keep the original procedure because it is simpler and already proven.",
  decisive: true,
} as const;

const weakDimensionResult = {
  dimensionId: "constraint-tradeoff",
  score: 58,
  evidence: "keep the original procedure",
  missing: "A re-derivation from the changed constraint.",
};

describe("reviewGradeSchema cognitive scratchpad", () => {
  it("accepts one concise private scratchpad and a natural targeted question", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "Keeping the proven procedure protects simplicity, which is a sound instinct while its safety conditions still hold. You assumed the new constraint does not change the controlling failure mode.\n\nA heuristic must be re-derived when the constraint that made it safe changes. Which step of your procedure becomes unsafe first under the new limit?",
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
});
