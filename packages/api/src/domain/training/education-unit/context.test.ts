import { describe, expect, it } from "vitest";

import type { UnitTurnContextInput } from "./context";
import { buildUnitTurnContext } from "./context";
import { initialState } from "./fsm";

const baseInput = (
  overrides: Partial<UnitTurnContextInput> = {},
): UnitTurnContextInput => ({
  unit: {
    title: "Diagnose workflow failure",
    learningGoal: "Separate symptoms from causes.",
    whyItMatters: "Wrong diagnoses create expensive fixes.",
    seedPrompt: "A workflow slows after a release. What do you inspect?",
    seedHint: "Separate observations from explanations.",
    clusterArcFrame: "This advances causal diagnosis.",
    unitMasteryContract: null,
  },
  state: initialState("unit-1", "education-unit-v2"),
  policy: {
    maxGrillsBeforeTeach: 2,
    maxRepairsBeforeMicroTeach: 2,
  },
  passes: 3,
  memories: [],
  difficultyLine: null,
  pendingConnectTeach: false,
  solveTaskPending: false,
  scenarioSpec: null,
  knowledge: null,
  ...overrides,
});

describe("buildUnitTurnContext", () => {
  it("renders phase, difficulty, and memories deterministically", () => {
    const context = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v2"),
          phase: "connect",
          pass: 2,
        },
        difficultyLine: "Target the learner at rating 1200.",
        memories: [
          { content: "They over-index on the first visible symptom." },
        ],
      }),
    );

    expect(context).toContain("Phase: connect (round 2 of 3)");
    expect(context).toContain("Target the learner at rating 1200.");
    expect(context).toContain("They over-index on the first visible symptom.");
  });

  it("adds the missed-connection teaching directive only to the next Solve turn", () => {
    const solveContext = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v2"),
          phase: "solve",
        },
        pendingConnectTeach: true,
      }),
    );
    expect(solveContext).toContain(
      "The learner did not reconstruct the connection on their own",
    );

    const connectContext = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v2"),
          phase: "connect",
        },
        pendingConnectTeach: true,
      }),
    );
    expect(connectContext).not.toContain(
      "The learner did not reconstruct the connection on their own",
    );
  });

  it("makes the first Solve turn's required event explicit", () => {
    const context = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v2"),
          phase: "solve",
        },
        solveTaskPending: true,
      }),
    );

    expect(context).toContain("must present the solve task");
    expect(context).toContain('reason:"prompted"');
    expect(context).toContain("Do not grade");
  });

  it("adds micro-teaching only after the Solve repair threshold", () => {
    const belowThreshold = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v2"),
          phase: "solve",
          solveRepairs: 1,
        },
      }),
    );
    expect(belowThreshold).not.toContain("MICRO-TEACH");

    const atThreshold = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v2"),
          phase: "solve",
          solveRepairs: 2,
        },
      }),
    );
    expect(atThreshold).toContain("MICRO-TEACH");
  });

  it("gates scenario-spec blocks on which round recorded the spec", () => {
    const spec = (pass: 1 | 2 | undefined) => ({
      targetSkill: "Separate correlation from causation",
      surface: "A slow release",
      canonicalAnswer: "Demand a discriminating prediction.",
      reasoningPath: "Find the differing observable.",
      rubric: "Cites a discriminating observable.",
      pass,
    });
    const at = (phase: "connect" | "solve", specPass: 1 | 2 | undefined) =>
      buildUnitTurnContext(
        baseInput({
          state: {
            ...initialState("unit-1", "education-unit-v2"),
            phase,
            pass: 2,
          },
          scenarioSpec: spec(specPass),
        }),
      );

    // Round-2 connect evolves the world off round 1's spec (untagged legacy
    // specs count as round 1), then grades the probe against its own spec.
    expect(at("connect", 1)).toContain("## Scenario evolution constraint");
    expect(at("connect", undefined)).toContain(
      "## Scenario evolution constraint",
    );
    expect(at("connect", 2)).toContain("## Active connection scenario");
    expect(at("connect", 2)).not.toContain("## Scenario evolution constraint");

    // Solve grades only against the current round's spec — a prior round's
    // canonical answer belongs to an earlier form of the scenario.
    expect(at("solve", 2)).toContain("## Grading reference");
    expect(at("solve", 1)).not.toContain("## Grading reference");
    expect(at("solve", undefined)).not.toContain("## Grading reference");

    const teachContext = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v2"),
          phase: "teach",
          pass: 2,
        },
        scenarioSpec: spec(2),
      }),
    );
    expect(teachContext).toContain("## Scenario evolution constraint");
    // Evolving into round 3 is the final round: the
    // transfer mutation directive must be present.
    expect(teachContext).toContain("FINAL ROUND");
  });

  it("renders the workflow, assumed knowledge, and exact targets", () => {
    const context = buildUnitTurnContext(
      baseInput({
        knowledge: {
          workflow: {
            name: "Diagnose an incident",
            steps: ["Collect signals", "Separate hypotheses"],
          },
          framing: {
            question: "How do you separate symptoms from causes?",
            part: 1,
          },
          checked: [
            { label: "Symptom versus cause", content: "Do not conflate them." },
          ],
          targets: [
            {
              id: "entry-2",
              kind: "mechanism",
              label: "Correlated versus causal",
              content:
                "Demand a prediction that differs between the competing explanations.",
            },
          ],
        },
      }),
    );

    expect(context).toContain("## Knowledge");
    expect(context).toContain("Workflow: Diagnose an incident");
    expect(context).toContain(
      "Authored question: How do you separate symptoms from causes?",
    );
    expect(context).toContain("Already checked (assume known; build on these)");
    expect(context).toContain("entry-2 — mechanism — Correlated versus causal");
    expect(context).toContain(
      "Demand a prediction that differs between the competing explanations.",
    );
  });

  it("renders declarative concepts distinctly from executable mechanisms", () => {
    const context = buildUnitTurnContext(
      baseInput({
        knowledge: {
          workflow: {
            name: "Diagnose an incident",
            steps: ["Collect signals"],
          },
          framing: null,
          checked: [],
          targets: [
            {
              id: "entry-3",
              kind: "concept",
              label: "Signal provenance",
              content:
                "A signal is only as trustworthy as its collection path.",
            },
          ],
        },
      }),
    );

    expect(context).toContain("entry-3 — concept — Signal provenance");
  });
});
