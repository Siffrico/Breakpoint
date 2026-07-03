import { describe, expect, it } from "vitest";

import { toUnitEvent } from "./fsm-tools";

describe("toUnitEvent", () => {
  it("maps a continuePhase call to a phase_continues event", () => {
    expect(toUnitEvent("continuePhase", { reason: "prompted" })).toEqual({
      type: "phase_continues",
      reason: "prompted",
    });
  });

  it("maps a gradeConnection call to a connection_graded event", () => {
    expect(
      toUnitEvent("gradeConnection", { connected: true, reasoning: "got it" }),
    ).toEqual({ type: "connection_graded", connected: true });
  });

  it("maps a gradeSolution call to a solution_graded event", () => {
    expect(
      toUnitEvent("gradeSolution", {
        passed: false,
        score: 40,
        reasoning: "wrong",
        errorCodes: ["poor_problem_representation"],
      }),
    ).toEqual({ type: "solution_graded", passed: false });
  });

  it("returns null for an unrecognized tool name", () => {
    expect(toUnitEvent("somethingElse", {})).toBeNull();
  });

  it("returns null when the args fail schema validation", () => {
    expect(toUnitEvent("gradeConnection", { connected: "yes" })).toBeNull();
    expect(toUnitEvent("continuePhase", { reason: "unsure" })).toBeNull();
    expect(
      toUnitEvent("gradeSolution", {
        passed: false,
        score: 40,
        reasoning: "wrong",
      }),
    ).toBeNull();
    expect(
      toUnitEvent("gradeSolution", {
        passed: true,
        score: 90,
        reasoning: "correct",
        errorCodes: ["weak_definition"],
      }),
    ).toBeNull();
  });
});
