import { describe, expect, it } from "vitest";

import {
  OutcomeCompilationOutputSchema,
  OutcomeDefinitionSchema,
} from "./contracts";

const compilation = () => ({
  skillMap: {
    skills: [
      {
        name: "Preserve equivalence",
        description: "Transform an equation without changing its solution set.",
        items: [
          {
            kind: "concept" as const,
            name: "Equivalent equations",
            description:
              "Applying the same valid operation to both sides preserves the solution set.",
          },
        ],
      },
      {
        name: "Isolate the variable",
        description: "Choose operations that expose the requested value.",
        items: [
          {
            kind: "mechanism" as const,
            name: "Inverse operations",
            description:
              "Apply inverse operations in an order that reduces the equation while preserving equivalence.",
          },
        ],
      },
      {
        name: "Verify the solution",
        description: "Check the candidate against the original equation.",
        items: [
          {
            kind: "mechanism" as const,
            name: "Substitution check",
            description:
              "Substitute the candidate into the original equation and compare both sides.",
          },
        ],
      },
    ],
    expertJudgment: [
      {
        rule: "Choose the shortest equivalence-preserving route.",
        when: "Several valid transformations are available.",
      },
      {
        rule: "Check against the original form.",
        when: "A transformation introduced a denominator or sign change.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Change only one side.",
        whyItHappens: "The operation is treated as moving a term.",
        detectionCue: "The transformed equation has a different solution.",
      },
      {
        mistake: "Lose a negative sign.",
        whyItHappens: "Distribution is applied to only the first term.",
        detectionCue: "Substitution fails in the original equation.",
      },
    ],
  },
  practiceContract: {
    workflow: {
      name: "Solve a linear equation",
      steps: [
        "Read the requested value and constraints.",
        "Apply equivalence-preserving transformations.",
        "Verify the candidate in the original equation.",
      ],
    },
    responseMode: "select" as const,
    taskTypes: [
      {
        name: "SAT multiple-choice equation",
        situation: "A linear equation appears in SAT format.",
        learnerDoes: "Solve and select the correct value.",
        output: "One selected answer supported by valid algebra.",
        taskShape: "One equation, one question, and four answer choices.",
        skills: [
          "Preserve equivalence",
          "Isolate the variable",
          "Verify the solution",
        ],
      },
    ],
    qualityBar: ["Exactly one answer choice satisfies the equation."],
    variationAxes: [
      { name: "Representation", description: "Symbolic or contextual." },
      { name: "Unknown position", description: "One or both sides." },
    ],
    evaluationCriteria: [
      {
        criterion: "The selected value satisfies the original equation.",
        skills: [
          "Preserve equivalence",
          "Isolate the variable",
          "Verify the solution",
        ],
      },
    ],
    difficultyBands: [
      {
        band: 0 as const,
        task: "A direct equation with visible operations.",
        reasoning: "One or two transformations.",
        support: "All required information is explicit.",
        traps: [],
      },
      {
        band: 1 as const,
        task: "Variables appear on both sides.",
        reasoning: "Choose and sequence several transformations.",
        support: "The useful first transformation is not indicated.",
        traps: ["one-sided transformation"],
      },
      {
        band: 2 as const,
        task: "A contextual equation includes plausible near-miss answers.",
        reasoning: "Model, solve, and interpret the requested value.",
        support: "The equation must be constructed from the situation.",
        traps: ["sign loss", "answering for the wrong quantity"],
      },
    ],
    neverDo: ["Use terminology or notation outside the assessed domain."],
  },
});

describe("OutcomeDefinitionSchema", () => {
  it("requires the confirmed title and observable result", () => {
    expect(
      OutcomeDefinitionSchema.safeParse({
        title: "SAT Algebra",
        result: "Solve SAT Algebra questions accurately across official forms.",
      }).success,
    ).toBe(true);
    expect(
      OutcomeDefinitionSchema.safeParse({ title: "SAT Algebra" }).success,
    ).toBe(false);
  });
});

describe("OutcomeCompilationOutputSchema", () => {
  it("accepts one skill map and one practice contract", () => {
    expect(
      OutcomeCompilationOutputSchema.safeParse(compilation()).success,
    ).toBe(true);
  });

  it("requires useful skill coverage", () => {
    const value = compilation();
    value.skillMap.skills = value.skillMap.skills.slice(0, 2);
    expect(OutcomeCompilationOutputSchema.safeParse(value).success).toBe(false);
  });

  it("rejects a skill that practice does not exercise and evaluate", () => {
    const value = compilation();
    const task = value.practiceContract.taskTypes[0];
    const criterion = value.practiceContract.evaluationCriteria[0];
    if (task)
      task.skills = task.skills.filter(
        (name) => name !== "Verify the solution",
      );
    if (criterion) {
      criterion.skills = criterion.skills.filter(
        (name) => name !== "Verify the solution",
      );
    }
    expect(OutcomeCompilationOutputSchema.safeParse(value).success).toBe(false);
  });

  it("requires ordered difficulty bands", () => {
    const value = compilation();
    value.practiceContract.difficultyBands.reverse();
    expect(OutcomeCompilationOutputSchema.safeParse(value).success).toBe(false);
  });
});
