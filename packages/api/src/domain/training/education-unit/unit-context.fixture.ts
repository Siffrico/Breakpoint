import type { UnitContext } from "@acme/validators";

export const makeUnitContext = ({
  criterionId = "derive-under-pressure",
  criterion = "Re-derive the move from the changed constraint.",
}: {
  criterionId?: string;
  criterion?: string;
} = {}): UnitContext => ({
  version: 1,
  performance: "Make and defend the expert move under changed constraints.",
  targets: [
    {
      id: "target-1",
      skill: "Constraint-driven reasoning",
      kind: "mechanism",
      label: "Re-derive the move",
      content: "Derive the move from current constraints instead of memory.",
    },
  ],
  workflow: {
    name: "Constraint-first decision",
    steps: ["Read the constraint", "Derive the move", "Check the consequence"],
  },
  expertise: {
    expertJudgment: [
      { rule: "Re-derive after material change", when: "A constraint changes" },
      { rule: "Check the consequence", when: "Before committing the move" },
    ],
    commonMistakes: [
      {
        mistake: "Copies the original procedure",
        whyItHappens: "The surface looks familiar",
        detectionCue: "The changed constraint never affects the reasoning",
      },
      {
        mistake: "States a conclusion without a causal path",
        whyItHappens: "Vocabulary substitutes for reasoning",
        detectionCue: "No consequence is checked",
      },
    ],
  },
  testing: {
    responseMode: "judge",
    taskTypes: [
      {
        name: "Changed constraint",
        situation: "A familiar case contains one material change.",
        learnerDoes: "Choose and defend the move.",
        output: "A decision with causal justification.",
        taskShape: "Short scenario with competing plausible moves.",
        skills: ["Constraint-driven reasoning"],
      },
    ],
    variationAxes: [
      { name: "Domain", description: "Change the surface domain." },
      { name: "Constraint", description: "Change the decisive constraint." },
    ],
    neverDo: ["Reward recalled wording without the mechanism."],
  },
  judgment: {
    criteria: [
      {
        id: criterionId,
        criterion,
        skills: ["Constraint-driven reasoning"],
      },
    ],
    qualityBar: ["The decision follows causally from the changed constraint."],
  },
});
