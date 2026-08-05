import { describe, expect, it } from "vitest";

import {
  MAX_OUTCOMES_PER_PLAN,
  OutcomeCurriculumOutputSchema,
  SyllabusOutputSchema,
} from "./contracts";

const identityReport = {
  targetIdentity: "SAT test-taker targeting 1500+",
  headline: "Every question type, at any difficulty.",
  motivation: "Wants a score that opens the schools they named.",
  currentBaseline: "Scores well on math, loses points on reading.",
  hardMoments: ["Two options both look defensible."],
  constraints: ["Twelve weeks until the test date."],
  proofOfProgress: "A full practice section at target accuracy.",
  behaviorSignals: [
    "Finishes sections early",
    "Rechecks arithmetic",
    "Skips and returns",
  ],
  confidenceFlags: [],
};

const outcome = (title: string) => ({
  title,
  mainOutcome: "The single defensible answer, justified from the passage.",
  summary: `Items in ${title}.`,
  whyItMatters: "It is a graded domain on the test.",
  workflow: {
    name: "Solve one item",
    steps: ["Read for the constraint.", "Predict.", "Test each option."],
  },
  scenarioArchetype: "select" as const,
  scenarioArchetypeWhy: "The SAT is a selected-response instrument.",
  scenarioBrief: {
    taskShape: "One passage, one blank, four options.",
    qualityBar: ["Exactly one option survives the constraint."],
    variationAxes: ["Constraint carried by a contrast word."],
    neverDo: ["No vocabulary the constraint cannot disambiguate."],
  },
  masteryContract: { exitCriteria: ["Answers at the top band."] },
});

const planDraft = (outcomeCount: number) => ({
  title: "sat",
  summary: "Every question type, at any difficulty.",
  ordering: "sequential" as const,
  orderingWhy: "Nobody mistakes a grid-in for a reading item.",
  outcomes: Array.from({ length: outcomeCount }, (_, index) =>
    outcome(`Domain ${index + 1}`),
  ),
});

const output = (outcomeCount: number) => ({
  identityReport,
  planDraft: planDraft(outcomeCount),
});

describe("OutcomeCurriculumOutputSchema", () => {
  it("accepts a single-outcome plan", () => {
    expect(OutcomeCurriculumOutputSchema.safeParse(output(1)).success).toBe(
      true,
    );
  });

  it("accepts an eight-outcome plan, the SAT shape", () => {
    expect(OutcomeCurriculumOutputSchema.safeParse(output(8)).success).toBe(
      true,
    );
  });

  it("rejects a plan with no outcomes", () => {
    expect(OutcomeCurriculumOutputSchema.safeParse(output(0)).success).toBe(
      false,
    );
  });

  it("rejects a plan past the outcome ceiling", () => {
    expect(
      OutcomeCurriculumOutputSchema.safeParse(output(MAX_OUTCOMES_PER_PLAN + 1))
        .success,
    ).toBe(false);
  });

  it("requires a main outcome on every node", () => {
    const draft = planDraft(2);
    const [first] = draft.outcomes;
    if (first) first.mainOutcome = "";

    expect(
      OutcomeCurriculumOutputSchema.safeParse({
        identityReport,
        planDraft: draft,
      }).success,
    ).toBe(false);
  });

  it("rejects a solve procedure shorter than three steps", () => {
    const draft = planDraft(1);
    const [first] = draft.outcomes;
    if (first) first.workflow.steps = ["Answer it."];

    expect(
      OutcomeCurriculumOutputSchema.safeParse({
        identityReport,
        planDraft: draft,
      }).success,
    ).toBe(false);
  });

  it("rejects a scenario brief missing its failure modes", () => {
    const draft = planDraft(1);
    const [first] = draft.outcomes;
    if (first) first.scenarioBrief.neverDo = [];

    expect(
      OutcomeCurriculumOutputSchema.safeParse({
        identityReport,
        planDraft: draft,
      }).success,
    ).toBe(false);
  });
});

describe("SyllabusOutputSchema", () => {
  const axis = (label: string) => ({
    axis: `How do you handle ${label}?`,
    items: [
      {
        kind: "concept" as const,
        label,
        content: `What is true about ${label}, and when.`,
      },
    ],
  });

  it("accepts axes phrased as questions", () => {
    expect(
      SyllabusOutputSchema.safeParse({
        axes: [
          axis("a contrast word"),
          axis("parallel structure"),
          axis("register"),
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects an axis written as a topic heading", () => {
    const headed = { ...axis("context clues"), axis: "Context clues" };

    expect(
      SyllabusOutputSchema.safeParse({
        axes: [headed, axis("parallel structure"), axis("register")],
      }).success,
    ).toBe(false);
  });

  it("rejects a syllabus too thin to vary tasks against", () => {
    expect(
      SyllabusOutputSchema.safeParse({ axes: [axis("a contrast word")] })
        .success,
    ).toBe(false);
  });
});
