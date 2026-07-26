import { describe, expect, it } from "vitest";

import { SolutionGradedEvidenceSchema, toUnitEvent } from "./model-event";

const grade = { passAt: 80 };

describe("toUnitEvent", () => {
  it("preserves continuation evidence", () => {
    expect(
      toUnitEvent({ type: "phase_continues", reason: "prompted" }, grade),
    ).toEqual({ type: "phase_continues", reason: "prompted" });
  });

  it("keeps reasoning private when mapping connection evidence", () => {
    expect(
      toUnitEvent(
        {
          type: "connection_graded",
          connected: true,
          reasoning: "got it",
        },
        grade,
      ),
    ).toEqual({ type: "connection_graded", connected: true });
  });

  it("derives the verdict from the runtime pass threshold", () => {
    expect(
      toUnitEvent(
        {
          type: "solution_graded",
          score: 79,
          reasoning: "missed",
          errorCodes: ["poor_problem_representation"],
        },
        grade,
      ),
    ).toMatchObject({ type: "solution_graded", passed: false, score: 79 });
    expect(
      toUnitEvent(
        {
          type: "solution_graded",
          score: 80,
          reasoning: "clean",
          errorCodes: [],
        },
        grade,
      ),
    ).toMatchObject({ type: "solution_graded", passed: true, score: 80 });
  });

  it("does not permit the model to declare passed", () => {
    expect(
      SolutionGradedEvidenceSchema.safeParse({
        type: "solution_graded",
        passed: true,
        score: 40,
        reasoning: "wrong",
        errorCodes: ["cannot_choose_tool"],
      }).success,
    ).toBe(false);
  });

  it("rejects score and error-code contradictions", () => {
    expect(
      toUnitEvent(
        {
          type: "solution_graded",
          score: 40,
          reasoning: "wrong",
          errorCodes: [],
        },
        grade,
      ),
    ).toBeNull();
    expect(
      toUnitEvent(
        {
          type: "solution_graded",
          score: 90,
          reasoning: "correct",
          errorCodes: ["weak_definition"],
        },
        grade,
      ),
    ).toBeNull();
  });
});
