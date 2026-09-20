import { describe, expect, it } from "vitest";

import { makeUnitContext } from "./unit-context.fixture";
import {
  getReviewPresentationReadinessIssue,
  getScenarioTaskReadinessIssue,
  getUnitReadinessIssue,
} from "./unit-readiness";

describe("unit learner readiness", () => {
  it("accepts free-response task modes without inventing format constraints", () => {
    expect(
      getScenarioTaskReadinessIssue({
        prompt: "Diagnose the failure and justify the next probe.",
        responseMode: "judge",
      }),
    ).toBeNull();
  });

  it("accepts an unsolved selected-response review with a private A-D key", () => {
    expect(
      getReviewPresentationReadinessIssue({
        assistantMessage: `Which policy preserves both constraints?

A. Retry every request
B. Retry only idempotent requests
C. Never retry
D. Retry writes without a key`,
        verifier: {
          kind: "fixed_answer",
          answer: "B",
          scratchpad:
            "Solution: B preserves both constraints. The other options duplicate effects or sacrifice recovery. Self-contained.",
        },
      }),
    ).toBeNull();
  });

  it("rejects a selected-response review that reveals a worked answer", () => {
    expect(
      getReviewPresentationReadinessIssue({
        assistantMessage: `## Worked Example

Which word fits?

A. narrow
B. broad
C. quiet
D. late

Answer: A`,
        verifier: {
          kind: "fixed_answer",
          answer: "C",
          scratchpad:
            "Solution: C fits the unseen intended passage. The other choices miss its tone. Self-contained.",
        },
      }),
    ).toBe("Scenario must not contain a worked solution or expose its answer.");
  });

  it("accepts a selected-response task with four labeled choices", () => {
    expect(
      getScenarioTaskReadinessIssue({
        prompt: `Which choice best completes the text?

A. skeptical
B. cautious
C. elated
D. indifferent`,
        responseMode: "select",
      }),
    ).toBeNull();
  });

  it("accepts complete inline choices for deterministic display formatting", () => {
    expect(
      getScenarioTaskReadinessIssue({
        prompt:
          "Which word fits? A) skeptical B) cautious C) elated D) indifferent",
        responseMode: "select",
      }),
    ).toBeNull();
  });

  it("rejects a selected-response task that refers to absent choices", () => {
    expect(
      getScenarioTaskReadinessIssue({
        prompt:
          "Read the sentence, predict a word, and then check the four choices below.",
        responseMode: "select",
      }),
    ).toBe(
      "Selected-response task must include 4 options labeled A-D; found 0.",
    );
  });

  it("rejects raw HTML and worked answers in learner tasks", () => {
    expect(
      getScenarioTaskReadinessIssue({
        prompt:
          "<p>Which claim fits?</p> A) first B) second C) third D) fourth",
        responseMode: "select",
      }),
    ).toBe("Learner task must use Markdown, not raw HTML.");
    expect(
      getScenarioTaskReadinessIssue({
        prompt:
          "Worked Example: Correct answer: B. A) first B) second C) third D) fourth",
        responseMode: "select",
      }),
    ).toBe(
      "Selected-response task must be unsolved and must not expose an answer.",
    );
  });

  it("rejects persisted content without authoritative context", () => {
    expect(
      getUnitReadinessIssue({
        unitContext: null,
      }),
    ).toBe("Unit capability context is missing or invalid.");
  });

  it("accepts a selected-response assignment before the mentor authors its scenario", () => {
    const unitContext = makeUnitContext();
    expect(
      getUnitReadinessIssue({
        unitContext: {
          ...unitContext,
          testing: {
            ...unitContext.testing,
            responseMode: "select",
          },
        },
      }),
    ).toBeNull();
  });

  it("does not require a persisted teaching card because the mentor writes it live", () => {
    expect(
      getUnitReadinessIssue({
        unitContext: makeUnitContext(),
      }),
    ).toBeNull();
  });
});
