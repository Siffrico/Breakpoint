import { describe, expect, it } from "vitest";

import { renderSeedPrompt, seedStageOutputSchema } from "./contracts";

const base = {
  title: "Choose the precise claim",
  buildContent:
    "**Heuristic**\nRe-derive the move whenever a material constraint changes.\n\n**Worked example**\n**Read** — A deploy slows after one configuration change.\n**Predict** — The changed constraint may invalidate the familiar fix.\n**Compare** — Restarting treats the symptom; isolating the changed variable tests the cause.\n**Decide** — Probe the changed variable first because it distinguishes the causal hypotheses.\n\nHow would you explain this heuristic in your own words?",
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

  it("rejects teaching without the worked-example reasoning sequence", () => {
    expect(
      seedStageOutputSchema(false).safeParse({
        ...base,
        buildContent:
          "**Heuristic** Re-check changed constraints before acting. **Worked example** A configuration changed, so inspect it first. How would you explain this heuristic in your own words?",
      }).success,
    ).toBe(false);
  });

  it("rejects teaching sections in the wrong order", () => {
    expect(
      seedStageOutputSchema(false).safeParse({
        ...base,
        buildContent:
          "**Worked example** **Read** A deploy slows. **Predict** The changed input matters. **Compare** Restarting hides the cause. **Decide** Test the input. **Heuristic** Re-derive after a material change. How would you explain this heuristic in your own words?",
      }).success,
    ).toBe(false);
  });

  it("rejects a teaching card with more than one learner question", () => {
    expect(
      seedStageOutputSchema(false).safeParse({
        ...base,
        buildContent: `${base.buildContent} What example would you use?`,
      }).success,
    ).toBe(false);
  });
});
