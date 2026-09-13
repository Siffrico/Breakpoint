import { describe, expect, it } from "vitest";

import type { UnitDifficultySnapshot } from "@acme/validators";

import {
  createCritiqueContext,
  createMentorContext,
  createMentorScenarioContext,
} from "./unit-context";
import { makeUnitContext } from "./unit-context.fixture";

const unitContext = makeUnitContext();
const difficulty = {
  nodeId: "node-1",
  directive: {
    intent: "probe",
    bandOrder: 1,
    supportLevel: "guided",
    targetItemRating: 1300,
    targetMisconceptionCode: null,
    reason: "Increase independent reasoning.",
    nextProgress: { bandOrder: 1, supportLevel: "guided" },
  },
  promptBlock: "Use minimal support and require three causal steps.",
  ratingSnapshot: "rating snapshot",
  learnerRating: 1260,
} satisfies UnitDifficultySnapshot;

describe("unit agent context projections", () => {
  it("gives the mentor the assignment, workflow, Goldilocks, and learner memory", () => {
    const result = createMentorContext({
      unitContext,
      difficulty,
      memories: [
        {
          id: "memory-1",
          content: "The learner defaults to copied procedures.",
          source: "unit_report",
          importId: null,
          createdAt: new Date(),
          updatedAt: null,
        },
      ],
    });

    expect(result).toContain("## Unit assignment");
    expect(result).toContain("## Expert workflow");
    expect(result).toContain("## Goldilocks");
    expect(result).toContain("The learner defaults to copied procedures.");
    expect(result).toContain("## Test contract");
    expect(result).toContain("## Judgment standard");
  });

  it("gives challenge creation the test contract, judgment, Goldilocks, and fresh-surface guard", () => {
    const result = createMentorScenarioContext({
      unitContext,
      difficulty,
      previousChallengePrompts: [
        "The earlier production scenario.\n\nA) Repeated option text.",
      ],
    });

    expect(result).toContain("## Test contract");
    expect(result).toContain("## Judgment standard");
    expect(result).toContain("## Goldilocks");
    expect(result).toContain("The earlier production scenario.");
    expect(result).not.toContain("Repeated option text");
    expect(result).not.toContain("## Expert workflow");
    expect(result).not.toContain("## Expert judgment");
    expect(result).not.toContain("Learner memory");
  });

  it("keeps teaching support out of the independent review prompt", () => {
    const result = createMentorScenarioContext({
      unitContext,
      difficulty: {
        ...difficulty,
        promptBlock: `## Difficulty directive
- Format: Selected response
- Support: Begin with a fully worked example, then pose the scenario.
- Approach: Standard training scenario.`,
      },
    });

    expect(result).toContain("- Format: Selected response");
    expect(result).toContain("- Approach: Standard training scenario.");
    expect(result).not.toContain("- Support:");
    expect(result).not.toContain("fully worked example");
  });

  it("keeps grading independent from difficulty, memory, and prior challenges", () => {
    const result = createCritiqueContext({
      unitContext,
    });

    expect(result).toContain("## Unit assignment");
    expect(result).toContain("## Expert workflow");
    expect(result).toContain("## Judgment standard");
    expect(result).not.toContain("## Test contract");
    expect(result).not.toContain("## Goldilocks");
    expect(result).not.toContain("The earlier production scenario.");
    expect(result).not.toContain("Learner memory");
  });
});
