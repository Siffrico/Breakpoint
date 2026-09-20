import { describe, expect, it } from "vitest";

import { createUnitContext } from "./create-unit-context";

const makeContext = (): Parameters<typeof createUnitContext>[0] => ({
  contract: {
    outcomeResult: "Diagnose the cause and defend the next probe.",
    skillMap: {
      skills: ["Frame", "Verify"].map((name) => ({
        name,
        description: `${name} the decision.`,
        items: [
          {
            kind: "mechanism" as const,
            name: `${name} item`,
            description: `${name} knowledge.`,
          },
        ],
      })),
      expertJudgment: [
        { rule: "Separate hypotheses", when: "Evidence is ambiguous" },
        { rule: "Verify causally", when: "A probe changes the system" },
      ],
      commonMistakes: [
        {
          mistake: "Chase the latest change",
          whyItHappens: "Timing feels causal",
          detectionCue: "No alternative hypothesis is tested",
        },
        {
          mistake: "Change several variables",
          whyItHappens: "Action feels urgent",
          detectionCue: "The result cannot isolate one cause",
        },
      ],
    },
    practiceContract: {
      workflow: {
        name: "Causal diagnosis",
        steps: ["Frame hypotheses", "Choose a probe", "Verify the cause"],
      },
      responseMode: "judge",
      taskTypes: [
        {
          name: "Choose a probe",
          situation: "Several causes fit the symptom.",
          learnerDoes: "Choose and defend a discriminating probe.",
          output: "One probe with predicted signals.",
          taskShape: "Evidence, alternatives, and one decision.",
          skills: ["Frame"],
        },
        {
          name: "Verify a fix",
          situation: "A proposed fix appears to work.",
          learnerDoes: "Prove the causal mechanism.",
          output: "A verification plan.",
          taskShape: "A change and an ambiguous result.",
          skills: ["Verify"],
        },
      ],
      qualityBar: ["The decision separates plausible causes."],
      variationAxes: [
        { name: "Evidence", description: "Change the available signal." },
        { name: "Trap", description: "Change the plausible near miss." },
      ],
      evaluationCriteria: [
        {
          criterion: "The probe distinguishes the leading hypotheses.",
          skills: ["Frame"],
        },
        {
          criterion: "The verification establishes causality.",
          skills: ["Verify"],
        },
      ],
      difficultyBands: [0, 1, 2].map((band) => ({
        band: band as 0 | 1 | 2,
        task: `Band ${band}`,
        reasoning: `${band + 1} steps`,
        support: band === 0 ? "Full" : band === 1 ? "Partial" : "None",
        traps: band === 0 ? [] : ["near miss"],
      })),
      neverDo: ["Require evidence the learner was not given."],
    },
  },
  targets: [
    {
      id: "entry-frame",
      skill: "Frame",
      kind: "mechanism",
      label: "Discriminating probe",
      content: "Predict a different observable result for each hypothesis.",
    },
  ],
});

describe("createUnitContext", () => {
  it("deterministically projects the selected curriculum frontier", () => {
    const context = makeContext();
    const result = createUnitContext(context);

    expect(result.performance).toBe(
      "Diagnose the cause and defend the next probe.",
    );
    expect(result.targets).toEqual(context.targets);
    expect(result.testing.taskTypes.map((task) => task.name)).toEqual([
      "Choose a probe",
    ]);
    expect(result.judgment.criteria).toEqual([
      {
        id: "criterion-1",
        criterion: "The probe distinguishes the leading hypotheses.",
        skills: ["Frame"],
      },
    ]);
  });

  it("rejects a target the outcome contract cannot teach or judge", () => {
    const context = makeContext();
    const target = context.targets[0];
    if (!target) throw new Error("Expected a selected target.");

    expect(() =>
      createUnitContext({
        ...context,
        targets: [
          {
            ...target,
            skill: "Unknown skill",
          },
        ],
      }),
    ).toThrow("not covered by the outcome Practice Contract");
  });
});
