import { describe, expect, it } from "vitest";

import { makeUnitContext } from "./unit-context.fixture";
import {
  getReviewPresentationReadinessIssue,
  getSeedTaskReadinessIssue,
  getUnitReadinessIssue,
} from "./unit-readiness";

describe("unit learner readiness", () => {
  it("accepts free-response task modes without inventing format constraints", () => {
    expect(
      getSeedTaskReadinessIssue({
        seedPrompt: "Diagnose the failure and justify the next probe.",
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
          type: "fixed_answer",
          answer: "B",
          checkerSpec: null,
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
          type: "fixed_answer",
          answer: "C",
          checkerSpec: null,
          scratchpad:
            "Solution: C fits the unseen intended passage. The other choices miss its tone. Self-contained.",
        },
      }),
    ).toBe(
      "Selected-response challenge must not contain a worked solution or expose its answer.",
    );
  });

  it("rejects a selected-response verifier without an A-D key", () => {
    expect(
      getReviewPresentationReadinessIssue({
        assistantMessage: `Choose one.

A. first
B. second
C. third
D. fourth`,
        verifier: {
          type: "fixed_answer",
          answer: "the second option",
          checkerSpec: null,
          scratchpad:
            "The second option is correct because it preserves the constraint. The alternatives do not. Self-contained.",
        },
      }),
    ).toBe("Selected-response verifier answer must be one label from A-D.");
  });

  it("accepts a selected-response task with four labeled choices", () => {
    expect(
      getSeedTaskReadinessIssue({
        seedPrompt: `Which choice best completes the text?

A. skeptical
B. cautious
C. elated
D. indifferent`,
        responseMode: "select",
      }),
    ).toBeNull();
  });

  it("rejects a selected-response task that refers to absent choices", () => {
    expect(
      getSeedTaskReadinessIssue({
        seedPrompt:
          "Read the sentence, predict a word, and then check the four choices below.",
        responseMode: "select",
      }),
    ).toBe(
      "Selected-response task must include 4 options labeled A-D; found 0.",
    );
  });

  it("rejects persisted content without authoritative context", () => {
    expect(
      getUnitReadinessIssue({
        seedPrompt: "Choose one.",
        unitContext: null,
      }),
    ).toBe("Unit capability context is missing or invalid.");
  });

  it("uses persisted unit context to validate the learner task", () => {
    const unitContext = makeUnitContext();
    expect(
      getUnitReadinessIssue({
        seedPrompt: "Choose from the four options below.",
        unitContext: {
          ...unitContext,
          testing: {
            ...unitContext.testing,
            responseMode: "select",
          },
        },
      }),
    ).toContain("options labeled A-D");
  });
});
