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
  state: initialState("unit-1", "education-unit-v1"),
  policy: { maxGrillsBeforeTeach: 2, maxRepairsBeforeMicroTeach: 2 },
  memories: [],
  progressSummary: null,
  difficultyLine: null,
  pendingConnectTeach: false,
  scenarioSpec: null,
  syllabus: null,
  ...overrides,
});

describe("buildUnitTurnContext", () => {
  it("renders phase, difficulty, progress, and memories deterministically", () => {
    const context = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v1"),
          phase: "connect",
          pass: 2,
        },
        difficultyLine: "Target the learner at rating 1200.",
        progressSummary: "The learner distinguishes evidence from guesses.",
        memories: [
          { content: "They over-index on the first visible symptom." },
        ],
      }),
    );

    expect(context).toContain("Phase: connect (pass 2 of 2)");
    expect(context).toContain("Target the learner at rating 1200.");
    expect(context).toContain(
      "The learner distinguishes evidence from guesses.",
    );
    expect(context).toContain("They over-index on the first visible symptom.");
  });

  it("adds the missed-connection teaching directive only to the next Solve turn", () => {
    const solveContext = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v1"),
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
          ...initialState("unit-1", "education-unit-v1"),
          phase: "connect",
        },
        pendingConnectTeach: true,
      }),
    );
    expect(connectContext).not.toContain(
      "The learner did not reconstruct the connection on their own",
    );
  });

  it("adds micro-teaching only after the Solve repair threshold", () => {
    const belowThreshold = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v1"),
          phase: "solve",
          solveRepairs: 1,
        },
      }),
    );
    expect(belowThreshold).not.toContain("MICRO-TEACH");

    const atThreshold = buildUnitTurnContext(
      baseInput({
        state: {
          ...initialState("unit-1", "education-unit-v1"),
          phase: "solve",
          solveRepairs: 2,
        },
      }),
    );
    expect(atThreshold).toContain("MICRO-TEACH");
  });

  it("renders the workflow, assumed knowledge, and exact targets", () => {
    const context = buildUnitTurnContext(
      baseInput({
        syllabus: {
          workflow: {
            name: "Diagnose an incident",
            steps: ["Collect signals", "Separate hypotheses"],
          },
          checked: [
            { label: "Symptom versus cause", gloss: "Do not conflate them." },
          ],
          targets: [
            {
              id: "entry-2",
              label: "Correlated versus causal",
              gloss: "Demand a discriminating prediction.",
            },
          ],
        },
      }),
    );

    expect(context).toContain("## Syllabus");
    expect(context).toContain("Workflow: Diagnose an incident");
    expect(context).toContain("Already checked (assume known; build on these)");
    expect(context).toContain("entry-2 — Correlated versus causal");
  });
});
