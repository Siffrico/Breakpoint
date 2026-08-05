import { describe, expect, it } from "vitest";

import {
  mentorOutputSchema,
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
