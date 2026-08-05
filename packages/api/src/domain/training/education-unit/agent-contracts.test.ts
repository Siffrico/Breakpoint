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
  intendedSolution: "Option B is the only choice that preserves both constraints.",
  shortcutFailures: [
    "Choose A | It optimizes the most visible metric | It violates the consistency requirement.",
  ],
  rubricAudit: {
    answerIntegrity: "The stem does not reveal B.",
    wellPosed: "Exactly one option satisfies both constraints.",
    selfContained: "The passage contains every necessary fact.",
    conceptRequired: "The learner must reconcile the two constraints.",
    shortcutsClosed: "Surface keyword matching selects A, not B.",
    difficulty: "The distractor protects one legitimate goal.",
    spark: "The decision resembles an authentic incident response.",
  },
};

describe("reviewPresentationSchema", () => {
  it("keeps a validated private verifier beside learner-facing scenario text", () => {
    const result = reviewPresentationSchema.safeParse({
      assistantMessage:
        "A signed-in learner sees stale progress after reconnecting. Which recovery policy should the team ship, and why?",
      verifier,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a wrong path that is not tied to a seductive misconception", () => {
    const result = reviewPresentationSchema.safeParse({
      assistantMessage:
        "A signed-in learner sees stale progress after reconnecting. Which recovery policy should the team ship, and why?",
      verifier: {
        ...verifier,
        shortcutFailures: ["Choose A because it is incorrect."],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects private authoring fields leaked into the scenario", () => {
    const result = reviewPresentationSchema.safeParse({
      assistantMessage:
        "The intendedSolution is option B. Explain why it preserves both constraints.",
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

const diagnosis = {
  optimizedFor: "Simplicity and a previously proven procedure.",
  hiddenAssumption:
    "The new constraint does not change which failure mode controls the decision.",
  rootCause: "constraint_blindness" as const,
  jitIntervention:
    "A heuristic must be re-derived when the constraint that made it safe changes.",
};

describe("reviewGradeSchema cognitive diagnosis", () => {
  it("accepts one private diagnosis and a natural targeted question for a gap", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "Keeping the proven procedure protects simplicity, which is a sound instinct while its safety conditions still hold. You assumed the new constraint does not change the controlling failure mode.\n\nA heuristic must be re-derived when the constraint that made it safe changes. Which step of your procedure becomes unsafe first under the new limit?",
      errorCodes: ["missed-controlling-constraint"],
      gradeReasoning:
        "The answer preserved the old procedure without testing its safety condition.",
      cognitiveDiagnosis: diagnosis,
      dimensionResults: [weakDimensionResult],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a gap with no cognitive diagnosis", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "The old procedure protects simplicity, but the new constraint changes its safety condition. Which step becomes unsafe first?",
      errorCodes: ["missed-controlling-constraint"],
      gradeReasoning:
        "The answer preserved the old procedure without testing its safety condition.",
      cognitiveDiagnosis: null,
      dimensionResults: [weakDimensionResult],
    });

    expect(result.success).toBe(false);
  });

  it("rejects vague named-template feedback", () => {
    const result = reviewGradeSchema(gradeShape).safeParse({
      assistantMessage:
        "The Mirror: you chose simplicity. The Pivot: reconsider the constraint. The Crucible: which step changes?",
      errorCodes: ["missed-controlling-constraint"],
      gradeReasoning:
        "The answer preserved the old procedure without testing its safety condition.",
      cognitiveDiagnosis: diagnosis,
      dimensionResults: [weakDimensionResult],
    });

    expect(result.success).toBe(false);
  });
});
