import { describe, expect, it } from "vitest";

import {
  mentorOutputSchema,
  reviewGradeSchema,
  reviewPresentationSchema,
} from "./agent-contracts";

describe("mentorOutputSchema", () => {
  it("accepts a completed teaching turn with scannable semantic sections", () => {
    const result = mentorOutputSchema("capability-1").safeParse({
      assistantMessage: `**Heuristic**
Read past the target and cap the answer's strength at the qualifier.

**Worked example**
**Read** — The metric rises while the constraint tightens.
**Predict** — Positive, but measured.
**Compare** — Optimistic is too strong; encouraging preserves the hedge.
**Decide** — Choose encouraging because the qualifier limits confidence.`,
      completedCapabilityId: "capability-1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects praise that claims completion without teaching the pattern", () => {
    const result = mentorOutputSchema("capability-1").safeParse({
      assistantMessage:
        "Exactly right. You calibrated the qualifier cleanly, so let me move you into the scenario.",
      completedCapabilityId: "capability-1",
    });

    expect(result.success).toBe(false);
  });

  it("accepts semantic teaching labels even when Markdown spacing varies", () => {
    const result = mentorOutputSchema("capability-1").safeParse({
      assistantMessage:
        "**Heuristic** Let the qualifier cap intensity. **Worked example** **Read** Expand the window. **Predict** Positive but measured. **Compare** Optimistic overstates; encouraging fits. **Decide** Choose encouraging.",
      completedCapabilityId: "capability-1",
    });

    expect(result.success).toBe(true);
  });

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
  decisive: true,
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
});
