import { describe, expect, it } from "vitest";

import type { ScenarioSpec } from "../scenario-spec";
import {
  getPhaseAgentOutputSchema,
  LearnerFacingAssistantMessageSchema,
} from "./output-schema";

const scenarioSpec: ScenarioSpec = {
  targetSkill: "Trace causality",
  surface: "A release pipeline",
  stateA: "Deployments fail intermittently.",
  stateB: "The team identifies the causal fault.",
  chasm: "Correlated logs do not isolate the failing dependency.",
  frictionNoise: "Several services restart together.",
  formatId: "transform",
  reasoningPathSteps: ["List hypotheses", "Find a discriminating trace"],
  withheldGivens: [],
  embeddedAlternatives: [],
  canonicalAnswer: "Trace the dependency boundary.",
  reasoningPath: "Compare predictions and inspect the differing boundary.",
  rubric: "Names the causal boundary and a discriminating observation.",
};

const output = {
  assistantMessage: "Substantive learner-facing reply.",
  event: null,
  scenarioSpec: null,
};

describe("phase output schemas", () => {
  it("requires a scenario artifact on Connect presentation", () => {
    const schema = getPhaseAgentOutputSchema("connect-presentation");
    expect(
      schema.safeParse({
        ...output,
        event: { type: "phase_continues", reason: "prompted" },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...output,
        event: { type: "phase_continues", reason: "prompted" },
        scenarioSpec,
      }).success,
    ).toBe(true);
  });

  it("cannot emit a Solve event during Connect evaluation", () => {
    expect(
      getPhaseAgentOutputSchema("connect-evaluation").safeParse({
        ...output,
        event: {
          type: "solution_graded",
          score: 90,
          reasoning: "wrong phase",
          errorCodes: [],
        },
      }).success,
    ).toBe(false);
  });

  it("requires every Connect answer to receive a connection verdict", () => {
    expect(
      getPhaseAgentOutputSchema("connect-evaluation").safeParse({
        ...output,
        event: { type: "phase_continues", reason: "needs_more_work" },
      }).success,
    ).toBe(false);
  });

  it("cannot replace the scenario during evaluation", () => {
    expect(
      getPhaseAgentOutputSchema("solve-evaluation").safeParse({
        ...output,
        event: {
          type: "solution_graded",
          score: 90,
          reasoning: "correct",
          errorCodes: [],
        },
        scenarioSpec,
      }).success,
    ).toBe(false);
  });

  it("requires private scenario data to remain separate from assistantMessage", () => {
    expect(
      getPhaseAgentOutputSchema("teach").safeParse({
        assistantMessage: "Worked example and transfer probe.",
        event: null,
        scenarioSpec,
      }).success,
    ).toBe(true);
    expect(LearnerFacingAssistantMessageSchema.safeParse("I").success).toBe(
      false,
    );
  });

  it("rejects model-authored authority fields", () => {
    expect(
      getPhaseAgentOutputSchema("solve-evaluation").safeParse({
        ...output,
        event: {
          type: "solution_graded",
          passed: true,
          score: 90,
          reasoning: "correct",
          errorCodes: [],
        },
      }).success,
    ).toBe(false);
  });
});
