import { describe, expect, it } from "vitest";

import type { UnitBuilderContext } from "./contracts";
import { buildSeedStageRequest } from "./seed-prompt-policy";

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
      },
    },
  },
  learner: {
    targetIdentity: "SAT test-taker",
    priorLearning: [],
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
