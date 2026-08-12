import { describe, expect, it } from "vitest";

import { renderSeedPrompt, seedStageOutputSchema } from "./contracts";

const base = {
  title: "Choose the precise claim",
  seedPrompt: "Read the passage. Which choice best states its main claim?",
  seedHint: "Choose one answer and cite the decisive sentence.",
  clusterArcFrame: "Match claims to evidence under pressure.",
  complexityBudget: 1 as const,
  teachbackSetup: {
    studentPersona: "A careful SAT reader",
    openingMisconception: "The broadest true statement must be the main claim.",
    roundLadder: [
      {
        round: 1,
        objection: "Why is the broader choice wrong?",
        objective: "Distinguish the central claim from context.",
      },
      {
        round: 2,
        objection: "Why is the detail not the claim?",
        objective: "Match the answer's scope to the passage.",
      },
      {
        round: 3,
        objection: "What evidence decides the tie?",
        objective: "Cite the sentence that controls the answer.",
      },
    ],
    passSignals: [
      "Matches claim scope to the passage",
      "Uses the controlling evidence",
    ],
    failureModes: [
      "Chooses a true but supporting detail",
      "Selects an implication the text does not support",
    ],
  },
  scenario: {
    title: "The competing claims",
    focusAreas: ["claim scope", "textual support"],
  },
};

const options = [
  { label: "A" as const, text: "The broad background claim" },
  { label: "B" as const, text: "The qualified central claim" },
  { label: "C" as const, text: "A true supporting detail" },
  { label: "D" as const, text: "An unsupported implication" },
] as const;

describe("seedStageOutputSchema", () => {
  it("requires four typed choices for selected response", () => {
    expect(
      seedStageOutputSchema(true).safeParse({ ...base, options }).success,
    ).toBe(true);
    expect(seedStageOutputSchema(true).safeParse(base).success).toBe(false);
  });

  it("renders typed choices into one learner-ready prompt", () => {
    expect(renderSeedPrompt({ ...base, options })).toBe(
      `${base.seedPrompt}\n\nA) The broad background claim\n\nB) The qualified central claim\n\nC) A true supporting detail\n\nD) An unsupported implication`,
    );
  });
});
