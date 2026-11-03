import { describe, expect, it } from "vitest";

import type { UnitDifficultySnapshot, UnitStep } from "@acme/validators";

import {
  createGradingContext,
  createMentorContext,
  createPartsContext,
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

const lesson: UnitStep = {
  kind: "teach",
  lesson: "Read the changed limit before you reuse the old move.",
  explanation: "The limit decides whether the old move still works.",
};

const round: UnitStep = {
  kind: "round",
  spec: {
    label: "learn",
    pacing: "part_by_part",
    partCount: 3,
    rated: false,
    mustPass: false,
    criterionIds: ["derive-under-pressure"],
  },
  narrative: "The earlier production scenario.\n\nMore detail about the line.",
  difficultyVector: {
    formatId: "frq",
    reasoningPathSteps: 3,
    withheldGivens: 1,
    embeddedAlternatives: 2,
  },
  parts: [
    {
      question: "What does the limit force?",
      criterionIds: ["derive-under-pressure"],
      verifier: {
        kind: "checks",
        checks: [
          { criterionId: "derive-under-pressure", check: "Derives the move." },
        ],
        scratchpad: "The limit decides the move.",
      },
      presentedAt: new Date(0).toISOString(),
      result: {
        met: false,
        criterionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: false,
            evidence: "old move",
            missing: "A move from the limit.",
          },
        ],
        feedback: "Feedback.",
        hypothesis: "Treats yesterday's success as today's rule.",
        causeType: "wrong-rule",
        errorCodes: ["old-move"],
      },
    },
  ],
};

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

  it("gives a new round the contract, the lesson, and a fresh-situation guard", () => {
    const result = createPartsContext({
      unitContext,
      difficulty,
      steps: [lesson, round, lesson],
      opensRound: true,
    });

    expect(result).toContain("## Test contract");
    expect(result).toContain("## Judgment standard");
    expect(result).toContain("## Goldilocks");
    expect(result).toContain("## The lesson the learner was given");
    expect(result).toContain("## Situations already used");
    expect(result).toContain("The earlier production scenario.");
    expect(result).not.toContain("More detail about the line.");
    expect(result).not.toContain("## The round in progress");
    expect(result).not.toContain("## Expert workflow");
    expect(result).not.toContain("Learner memory");
  });

  it("gives the next part the round in progress and what it found", () => {
    const result = createPartsContext({
      unitContext,
      difficulty,
      steps: [lesson, round],
      opensRound: false,
    });

    expect(result).toContain("## The round in progress (learn)");
    expect(result).toContain("(a) missed — What does the limit force?");
    expect(result).toContain("Treats yesterday's success as today's rule.");
    expect(result).toContain("## Repair target");
    expect(result).not.toContain("## Situations already used");
  });

  it("keeps teaching support out of the independent review prompt", () => {
    const result = createPartsContext({
      unitContext,
      steps: [],
      opensRound: true,
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

  it("grades from the lesson and the round, never difficulty or memory", () => {
    const result = createGradingContext({
      unitContext,
      steps: [lesson, round],
    });

    expect(result).toContain("## Unit assignment");
    expect(result).toContain("## Expert workflow");
    expect(result).toContain("## Judgment standard");
    expect(result).toContain("## The learner's explain-back");
    expect(result).toContain("Shared situation:");
    expect(result).not.toContain("## Test contract");
    expect(result).not.toContain("## Goldilocks");
    expect(result).not.toContain("Learner memory");
  });
});
