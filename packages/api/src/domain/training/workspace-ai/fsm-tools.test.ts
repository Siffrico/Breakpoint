import { describe, expect, it } from "vitest";

import { toUnitEvent } from "./fsm-tools";

const grade = { passAt: 80 };

describe("toUnitEvent", () => {
  it("maps a continuePhase call to a phase_continues event", () => {
    expect(toUnitEvent("continuePhase", { reason: "prompted" }, grade)).toEqual(
      {
        type: "phase_continues",
        reason: "prompted",
      },
    );
  });

  it("maps a gradeConnection call to a connection_graded event", () => {
    expect(
      toUnitEvent(
        "gradeConnection",
        { connected: true, reasoning: "got it" },
        grade,
      ),
    ).toEqual({ type: "connection_graded", connected: true });
  });

  it("derives a failing verdict from a score below the pass bar", () => {
    expect(
      toUnitEvent(
        "gradeSolution",
        {
          score: 40,
          reasoning: "wrong",
          errorCodes: ["poor_problem_representation"],
        },
        grade,
      ),
    ).toEqual({
      type: "solution_graded",
      passed: false,
      score: 40,
      errorCodes: ["poor_problem_representation"],
    });
  });

  it("derives a passing verdict from a score at the pass bar", () => {
    expect(
      toUnitEvent("gradeSolution", { score: 80, reasoning: "clean" }, grade),
    ).toEqual({
      type: "solution_graded",
      passed: true,
      score: 80,
      errorCodes: [],
    });
  });

  it("ignores a model-supplied passed flag in favor of the score", () => {
    expect(
      toUnitEvent(
        "gradeSolution",
        {
          passed: true,
          score: 40,
          reasoning: "wrong",
          errorCodes: ["cannot_choose_tool"],
        },
        grade,
      ),
    ).toEqual({
      type: "solution_graded",
      passed: false,
      score: 40,
      errorCodes: ["cannot_choose_tool"],
    });
  });

  it("returns null for an unrecognized tool name", () => {
    expect(toUnitEvent("somethingElse", {}, grade)).toBeNull();
  });

  it("returns null when the args fail schema validation", () => {
    expect(
      toUnitEvent("gradeConnection", { connected: "yes" }, grade),
    ).toBeNull();
    expect(
      toUnitEvent("continuePhase", { reason: "unsure" }, grade),
    ).toBeNull();
  });

  it("returns null when the error codes contradict the derived verdict", () => {
    // Failing score without a primary error code.
    expect(
      toUnitEvent("gradeSolution", { score: 40, reasoning: "wrong" }, grade),
    ).toBeNull();
    // Passing score carrying an error code.
    expect(
      toUnitEvent(
        "gradeSolution",
        { score: 90, reasoning: "correct", errorCodes: ["weak_definition"] },
        grade,
      ),
    ).toBeNull();
  });
});
