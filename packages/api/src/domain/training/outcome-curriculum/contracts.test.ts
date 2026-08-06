import { describe, expect, it } from "vitest";

import {
  MAX_OUTCOMES_PER_PLAN,
  OutcomeBlueprintOutputSchema,
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
  masteryContract: { exitCriteria: ["Answers at the top band."] },
});

const blueprintOutput = () => ({
  scenarioBrief: {
    taskShape: "One passage, one blank, four options.",
    qualityBar: ["Exactly one option survives the constraint."],
    variationAxes: ["Constraint carried by a contrast word."],
    neverDo: ["No vocabulary the constraint cannot disambiguate."],
  },
  blueprint: {
    declarativeKnowledge: [
      {
        label: "contrast",
        statement: "Contrast words reverse the needed meaning.",
        applicability: "When a contrast marker joins clauses.",
      },
      {
        label: "context",
        statement: "The local sentence constrains a defensible answer.",
        applicability: "For every passage item.",
      },
    ],
    cognitiveHeuristics: {
      expertMentality: [
        "Predict before comparing options.",
        "Test each option against the passage constraint.",
      ],
      commonTraps: [
        {
          trap: "Dictionary meaning",
          whyItIsTempting: "It is familiar.",
          detectionCue: "It fails the local constraint.",
        },
        {
          trap: "Broad synonym",
          whyItIsTempting: "It sounds positive.",
          detectionCue: "It lacks the required precision.",
        },
      ],
    },
    progression: {
      complexityAxes: ["Constraint distance", "Option similarity"],
      bandBriefs: [
        {
          band: 0,
          caseShape: "An explicit contrast and one viable option.",
          reasoningPath: "Read the contrast, predict, match.",
          withheldGivens: "Nothing is withheld.",
          embeddedAlternatives: "One clearly wrong option.",
          liveTraps: [],
        },
        {
          band: 1,
          caseShape: "The constraint sits one sentence away.",
          reasoningPath: "Locate the constraint, predict, eliminate.",
          withheldGivens: "Where the constraint lives.",
          embeddedAlternatives: "One broad synonym.",
          liveTraps: ["Broad synonym"],
        },
        {
          band: 2,
          caseShape: "An indirect constraint and two plausible options.",
          reasoningPath:
            "Infer the constraint, predict, separate two survivors.",
          withheldGivens: "The constraint and its polarity.",
          embeddedAlternatives: "Two options that both fit loosely.",
          liveTraps: ["Dictionary meaning", "Broad synonym"],
        },
      ],
    },
    taskVariations: [
      {
        context: "argumentative",
        applicability: "Passages that make a claim.",
        addedPressure: "The author's stance can mislead.",
      },
    ],
  },
  syllabus: {
    axes: [
      {
        axis: "How do you handle a contrast word?",
        items: [
          {
            kind: "concept" as const,
            label: "contrast",
            content: "A contrast marker fixes the required polarity.",
          },
        ],
      },
      {
        axis: "How do you separate two survivors?",
        items: [
          {
            kind: "mechanism" as const,
            label: "predict first",
            content: "State the required meaning before reading options.",
          },
        ],
      },
      {
        axis: "When is the common meaning wrong?",
        items: [
          {
            kind: "concept" as const,
            label: "register",
            content: "Contextual sense can oppose dictionary sense.",
          },
        ],
      },
    ],
  },
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
});

describe("OutcomeBlueprintOutputSchema", () => {
  it("accepts a complete pass-B blueprint", () => {
    expect(
      OutcomeBlueprintOutputSchema.safeParse(blueprintOutput()).success,
    ).toBe(true);
  });

  it("rejects a scenario brief missing its failure modes", () => {
    const output = blueprintOutput();
    output.scenarioBrief.neverDo = [];

    expect(OutcomeBlueprintOutputSchema.safeParse(output).success).toBe(false);
  });

  it("requires a structured knowledge-and-cognition blueprint", () => {
    const { blueprint: _blueprint, ...withoutBlueprint } = blueprintOutput();

    expect(
      OutcomeBlueprintOutputSchema.safeParse(withoutBlueprint).success,
    ).toBe(false);
  });

  it("allows only the five supported task-context variations", () => {
    const output = blueprintOutput();
    const [firstVariation] = output.blueprint.taskVariations;
    if (firstVariation) firstVariation.context = "memoir";

    expect(OutcomeBlueprintOutputSchema.safeParse(output).success).toBe(false);
  });

  it("requires one band brief per canonical band", () => {
    const output = blueprintOutput();
    output.blueprint.progression.bandBriefs =
      output.blueprint.progression.bandBriefs.slice(0, 2);

    expect(OutcomeBlueprintOutputSchema.safeParse(output).success).toBe(false);
  });

  it("rejects a syllabus too thin to vary tasks against", () => {
    const output = blueprintOutput();
    output.syllabus.axes = output.syllabus.axes.slice(0, 1);

    expect(OutcomeBlueprintOutputSchema.safeParse(output).success).toBe(false);
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
