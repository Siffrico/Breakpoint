import { describe, expect, it } from "vitest";

import type { UnitBuilderContext } from "./contracts";
import { buildSeedStageRequest } from "./seed-prompt-policy";

const blueprint = {
  declarativeKnowledge: [
    { label: "Contrast", statement: "Contrast markers reverse the expected meaning.", applicability: "When clauses are contrasted." },
    { label: "Context", statement: "Local context constrains the answer.", applicability: "For every passage item." },
  ],
  cognitiveHeuristics: {
    expertMentality: ["Predict before comparing options.", "Test options against the passage constraint."],
    commonTraps: [
      { trap: "Dictionary meaning", whyItIsTempting: "It is familiar.", detectionCue: "It fails the local constraint." },
      { trap: "Broad synonym", whyItIsTempting: "It sounds plausible.", detectionCue: "It lacks required precision." },
    ],
  },
  progression: {
    complexityAxes: ["Constraint distance", "Option similarity"],
    bandBriefs: [
      { band: 0 as const, caseShape: "Explicit contrast beside the blank.", reasoningPath: "Read the contrast, predict, match.", withheldGivens: "Nothing is withheld.", embeddedAlternatives: "One clearly wrong option.", liveTraps: [] },
      { band: 1 as const, caseShape: "Constraint sits one sentence away.", reasoningPath: "Locate the constraint, predict, eliminate.", withheldGivens: "Where the constraint lives.", embeddedAlternatives: "One broad synonym.", liveTraps: ["Broad synonym"] },
      { band: 2 as const, caseShape: "Indirect constraint and near-miss options.", reasoningPath: "Infer the constraint, predict, separate two survivors.", withheldGivens: "The constraint and its polarity.", embeddedAlternatives: "Two options that both fit loosely.", liveTraps: ["Dictionary meaning", "Broad synonym"] },
    ],
  },
  taskVariations: [{ context: "argumentative" as const, applicability: "Claim-based passages.", addedPressure: "Author stance can mislead." }],
};

const context = {
  node: {
    id: "unit-1",
    kind: "unit",
    title: "Practice contextual vocabulary",
    summary: "Use contrast to constrain meaning.",
    whyItMatters: "This is scored on the SAT.",
    orderIndex: 1,
  },
  planContext: {
    regime: "main_outcome",
    slotIndex: 1,
    totalSlots: 3,
    clusterContext: {
      title: "Craft and Structure",
      summary: "Selected-response reading tasks.",
      whyItMatters: "It is a scored SAT domain.",
      taskContract: {
        mainOutcome:
          "Select the single defensible answer from passage evidence.",
        scenarioBrief: {
          taskShape: "One passage, one blank, and four lettered options.",
          qualityBar: [
            "Exactly one option satisfies the contextual constraint.",
          ],
          variationAxes: ["A contrast word carries the constraint."],
          neverDo: ["Require knowledge outside the passage."],
        },
        blueprint,
      },
    },
  },
  learner: {
    targetIdentity: "SAT test-taker",
    priorLearning: [],
  },
  difficulty: {
    promptBlock: "## Difficulty directive (set by the training engine)",
    bandOrder: 2,
  },
  knowledge: {
    workflow: {
      name: "Solve vocabulary in context",
      steps: ["Find the constraint", "Predict", "Eliminate near-misses"],
    },
    framing: null,
    checked: [
      {
        label: "Context boundary",
        content: "Use only evidence available in the passage.",
      },
    ],
    targets: [
      {
        id: "target-1",
        kind: "mechanism",
        label: "Contrast constraint",
        content: "A contrast cue reverses the expected semantic direction.",
      },
    ],
  },
} satisfies UnitBuilderContext;

describe("buildSeedStageRequest", () => {
  it("builds main-outcome tasks from the fixed demand, scenario brief, and syllabus targets", () => {
    const request = buildSeedStageRequest(context);

    expect(request.prompt).toContain(
      "Select the single defensible answer from passage evidence.",
    );
    expect(request.prompt).toContain(
      "One passage, one blank, and four lettered options.",
    );
    expect(request.prompt).toContain(
      "Exactly one option satisfies the contextual constraint.",
    );
    expect(request.prompt).toContain("A contrast word carries the constraint.");
    expect(request.prompt).toContain("Require knowledge outside the passage.");
    expect(request.prompt).toContain("Contrast constraint");
    expect(request.prompt).toContain("Authoritative subtype blueprint");
    expect(request.prompt).toContain("argumentative");
  });

  it("hands the generator the engine's directive and only the chosen band's brief", () => {
    const request = buildSeedStageRequest(context);

    expect(request.prompt).toContain(
      "## Difficulty directive (set by the training engine)",
    );
    expect(request.prompt).toContain("Band 2: Indirect constraint");
    expect(request.prompt).not.toContain("Band 0:");
    expect(request.prompt).not.toContain("Band 1:");
  });

  it("falls back to the whole ladder when no directive resolved", () => {
    const request = buildSeedStageRequest({ ...context, difficulty: null });

    expect(request.prompt).toContain("No band was resolved for this task");
    expect(request.prompt).toContain("Band 0:");
    expect(request.prompt).toContain("Band 2:");
  });

  it("does not inherit foundation diagnostic requirements", () => {
    const request = buildSeedStageRequest(context);
    const instructions = `${request.system}\n${request.prompt}`;

    expect(instructions).not.toContain("exactly one new mechanism");
    expect(instructions).not.toContain("exactly three numbered questions");
    expect(instructions).not.toContain('End with "### Reconstruct the system"');
    expect(instructions).toContain(
      'do not create a pre-teach diagnostic, reduce the task to one mechanism or one failure, or append "Reconstruct the system" questions',
    );
  });

  it("keeps the reconstruction diagnostic inside the foundation policy", () => {
    const request = buildSeedStageRequest({
      ...context,
      planContext: {
        ...context.planContext,
        regime: "foundation",
        clusterContext: {
          ...context.planContext.clusterContext,
          taskContract: null,
        },
      },
    });

    expect(request.prompt).toContain('End with "### Reconstruct the system"');
    expect(request.prompt).toContain("exactly three numbered questions");
  });
});
