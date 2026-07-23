import { describe, expect, it } from "vitest";

import type { DifficultyVector, ScenarioFormat } from "@acme/validators";

import {
  countVector,
  deriveCanonicalDifficultyBands,
  predictItemRating,
} from "./difficulty-bridge";

const frqFormat: ScenarioFormat = {
  id: "frq",
  label: "FRQ",
  kind: "frq",
  description: "Free response",
};
const formats: ScenarioFormat[] = [frqFormat];
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

  it.each([
    [
      {
        id: "mcq",
        label: "MCQ",
        kind: "mcq",
        description: "Selected response",
      } as const,
      [955, 1430],
    ],
    [frqFormat, [1105, 1580]],
  ])("derives reachable canonical bands for $kind", (format, [floor, peak]) => {
    const bands = deriveCanonicalDifficultyBands(format);

    expect(bands).toHaveLength(3);
    expect(bands[0]?.minRating).toBe(floor);
    expect(bands.at(-1)?.maxRating).toBe(peak);
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
