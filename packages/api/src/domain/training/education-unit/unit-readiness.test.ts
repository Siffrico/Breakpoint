import { describe, expect, it } from "vitest";

import { makeUnitContext } from "./unit-context.fixture";
import {
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
