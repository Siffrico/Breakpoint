import { describe, expect, it } from "vitest";

import { toUnitEvent } from "./fsm-tools";

describe("toUnitEvent", () => {
  it("maps a gradeConnection call to a connection_graded event", () => {
    expect(
      toUnitEvent("gradeConnection", { connected: true, reasoning: "got it" }),
    ).toEqual({ type: "connection_graded", connected: true });
  });

  it("maps a gradeSolution call to a solution_graded event", () => {
    expect(
      toUnitEvent("gradeSolution", { passed: false, score: 40, reasoning: "wrong" }),
    ).toEqual({ type: "solution_graded", passed: false });
  });

  it("returns null for an unrecognized tool name", () => {
    expect(toUnitEvent("somethingElse", {})).toBeNull();
  });

  it("returns null when the args fail schema validation", () => {
    expect(toUnitEvent("gradeConnection", { connected: "yes" })).toBeNull();
  });
});
