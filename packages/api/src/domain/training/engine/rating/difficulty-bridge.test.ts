import { describe, expect, it } from "vitest";

import type { DifficultyVector, ScenarioFormat } from "@acme/validators";

import { countVector, predictItemRating } from "./difficulty-bridge";

const formats: ScenarioFormat[] = [
  { id: "frq", label: "FRQ", kind: "frq", description: "Free response" },
];
const base: DifficultyVector = {
  formatId: "frq",
  reasoningPathSteps: 1,
  withheldGivens: 1,
  embeddedAlternatives: 1,
};

describe("difficulty bridge", () => {
  it.each([
    "reasoningPathSteps",
    "withheldGivens",
    "embeddedAlternatives",
  ] as const)("is monotonic in %s", (axis) => {
    expect(
      predictItemRating({ ...base, [axis]: base[axis] + 1 }, formats),
    ).toBeGreaterThan(predictItemRating(base, formats));
  });

  it("throws for an unknown format", () => {
    expect(() =>
      predictItemRating({ ...base, formatId: "missing" }, formats),
    ).toThrow(RangeError);
  });

  it("returns null when a legacy spec lacks vector arrays", () => {
    expect(
      countVector({
        targetSkill: "x",
        surface: "s",
        canonicalAnswer: "a",
        reasoningPath: "r",
        rubric: "u",
      }),
    ).toBeNull();
  });
});
