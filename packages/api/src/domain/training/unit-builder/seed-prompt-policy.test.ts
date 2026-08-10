import { describe, expect, it } from "vitest";

import type { UnitBuilderContext } from "./contracts";
import { buildSeedStageRequest } from "./seed-prompt-policy";

const context: UnitBuilderContext = {
  node: {
    id: "unit-1",
    kind: "unit",
    title: "Practice equivalence",
    summary: "Solve one SAT Algebra task.",
    whyItMatters: "Equivalent equations are load-bearing.",
    orderIndex: 2,
  },
  planContext: {
    regime: "main_outcome",
    slotIndex: 1,
    totalSlots: 3,
    clusterContext: {
      title: "Algebra",
      summary: "Solve SAT Algebra questions.",
      whyItMatters: "It contributes to SAT Math performance.",
      taskContract: {
        outcomeResult:
          "Solve SAT Algebra questions accurately across official forms.",
        skillMap: {
          skills: [
            {
              name: "Preserve equivalence",
              description: "Transform equations without changing solutions.",
              items: [
                {
                  kind: "concept",
                  name: "Equivalent equations",
                  description:
                    "The same valid operation on both sides preserves solutions.",
                },
              ],
            },
            {
              name: "Isolate the variable",
              description: "Choose useful inverse operations.",
              items: [
                {
                  kind: "mechanism",
                  name: "Inverse operations",
                  description: "Apply inverse operations to expose the value.",
                },
              ],
            },
            {
              name: "Verify",
              description: "Check the candidate in the original equation.",
              items: [
                {
                  kind: "mechanism",
                  name: "Substitution",
                  description: "Substitute and compare both sides.",
                },
              ],
            },
          ],
          expertJudgment: [
            {
              rule: "Choose the shortest valid route.",
              when: "Several transformations are available.",
            },
            {
              rule: "Check the original equation.",
              when: "Signs or denominators changed.",
            },
          ],
          commonMistakes: [
            {
              mistake: "Change one side.",
              whyItHappens: "Terms are treated as moving.",
              detectionCue: "The solution changes.",
            },
            {
              mistake: "Lose a sign.",
              whyItHappens: "Distribution is incomplete.",
              detectionCue: "Substitution fails.",
            },
          ],
        },
        practiceContract: {
          workflow: {
            name: "Solve a linear equation",
            steps: [
              "Read the question.",
              "Transform the equation.",
              "Verify the value.",
            ],
          },
          responseMode: "select",
          taskTypes: [
            {
              name: "SAT multiple choice",
              situation: "A linear equation appears in SAT format.",
              learnerDoes: "Solve and select the correct value.",
              output: "One selected answer.",
              taskShape: "One equation and four options.",
              skills: [
                "Preserve equivalence",
                "Isolate the variable",
                "Verify",
              ],
            },
          ],
          qualityBar: ["Exactly one option satisfies the equation."],
          variationAxes: [
            { name: "Representation", description: "Symbolic or contextual." },
            { name: "Unknown position", description: "One or both sides." },
          ],
          evaluationCriteria: [
            {
              criterion: "The value satisfies the original equation.",
              skills: [
                "Preserve equivalence",
                "Isolate the variable",
                "Verify",
              ],
            },
          ],
          difficultyBands: [
            {
              band: 0,
              task: "Direct equation",
              reasoning: "One step",
              support: "Full",
              traps: [],
            },
            {
              band: 1,
              task: "Variables on both sides",
              reasoning: "Two steps",
              support: "Partial",
              traps: ["sign"],
            },
            {
              band: 2,
              task: "Contextual near misses",
              reasoning: "Three steps",
              support: "None",
              traps: ["sign", "wrong quantity"],
            },
          ],
          neverDo: ["Use non-SAT terminology."],
        },
      },
    },
  },
  learner: {
    targetIdentity: "SAT Math test-taker",
    priorLearning: [],
  },
  difficulty: {
    promptBlock: "Build at band 1.",
    bandOrder: 1,
  },
  knowledge: {
    workflow: {
      name: "Solve a linear equation",
      steps: ["Read.", "Transform.", "Verify."],
    },
    framing: null,
    checked: [],
    targets: [
      {
        id: "item-1",
        skill: "Equation reasoning",
        kind: "concept",
        label: "Equivalent equations",
        content: "Apply the same valid operation to both sides.",
      },
    ],
  },
};

describe("buildSeedStageRequest", () => {
  it("uses the fixed result, Skill Map, and Practice Contract", () => {
    const request = buildSeedStageRequest(context);

    expect(request.prompt).toContain("Fixed result:");
    expect(request.prompt).toContain("Practice Contract:");
    expect(request.prompt).toContain("Skill Map:");
    expect(request.prompt).toContain("SAT multiple choice");
    expect(request.prompt).toContain("Preserve equivalence");
  });

  it("selects the current difficulty band", () => {
    expect(buildSeedStageRequest(context).prompt).toContain(
      "Band 1: Variables on both sides",
    );
  });

  it("requires a compiled outcome contract", () => {
    const clusterContext = context.planContext.clusterContext;
    if (!clusterContext) throw new Error("Missing test cluster context.");
    expect(() =>
      buildSeedStageRequest({
        ...context,
        planContext: {
          ...context.planContext,
          clusterContext: { ...clusterContext, taskContract: null },
        },
      }),
    ).toThrow("requires an outcome contract");
  });
});
