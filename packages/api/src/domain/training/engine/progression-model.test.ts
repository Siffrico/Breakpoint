import { describe, expect, it } from "vitest";

import type { PracticeContract } from "@acme/validators";

import {
  DEFAULT_MAX_RATING_DEVIATION,
  difficultyRampOf,
  regimeForNodeKind,
  resolveProgressionModel,
  resolveScenarioFormat,
} from "./progression-model";

const practiceContract: PracticeContract = {
  workflow: {
    name: "Solve one task",
    steps: ["Read the task.", "Choose a valid method.", "Verify the result."],
  },
  responseMode: "select",
  taskTypes: [
    {
      name: "Selected response",
      situation: "A domain-authentic prompt.",
      learnerDoes: "Select and justify an answer.",
      output: "One answer with reasoning.",
      taskShape: "One prompt and four options.",
      skills: ["Frame", "Solve", "Verify"],
    },
  ],
  qualityBar: ["Exactly one answer is defensible."],
  variationAxes: [
    { name: "Context", description: "The surface situation changes." },
    { name: "Trap", description: "The plausible wrong route changes." },
  ],
  evaluationCriteria: [
    {
      criterion: "The answer follows from the supplied evidence.",
      skills: ["Frame", "Solve", "Verify"],
    },
  ],
  difficultyBands: [
    {
      band: 0,
      task: "Direct",
      reasoning: "One step",
      support: "Full",
      traps: [],
    },
    {
      band: 1,
      task: "Realistic",
      reasoning: "Two steps",
      support: "Partial",
      traps: ["near miss"],
    },
    {
      band: 2,
      task: "Adversarial",
      reasoning: "Three steps",
      support: "None",
      traps: ["near miss", "wrong frame"],
    },
  ],
  neverDo: ["Test unrelated knowledge."],
};

const bands = [
  { order: 0, minRating: 800, maxRating: 1000 },
  { order: 1, minRating: 1000, maxRating: 1200 },
  { order: 2, minRating: 1200, maxRating: 1400 },
];

describe("outcome progression", () => {
  it("maps only outcome nodes into the active regime", () => {
    expect(regimeForNodeKind("outcome")).toBe("main_outcome");
    expect(regimeForNodeKind("unit")).toBeNull();
  });

  it("derives workflow and rating gates from the Practice Contract", () => {
    const model = resolveProgressionModel({
      kind: "outcome",
      practiceContract,
      difficultyBands: bands,
    });

    expect(model).toEqual({
      regime: "main_outcome",
      workflow: practiceContract.workflow,
      bandRamp: { startRating: 1000, peakRating: 1400 },
      mastery: {
        masteryRating: 1300,
        maxRatingDeviation: DEFAULT_MAX_RATING_DEVIATION,
      },
    });
    expect(model && difficultyRampOf(model)).toEqual({
      startRating: 1000,
      peakRating: 1400,
    });
  });

  it("requires a compiled Practice Contract and difficulty bands", () => {
    expect(
      resolveProgressionModel({
        kind: "outcome",
        practiceContract: null,
        difficultyBands: bands,
      }),
    ).toBeNull();
  });

  it("resolves the task format from the Practice Contract", () => {
    expect(resolveScenarioFormat(practiceContract).kind).toBe("mcq");
  });
});
