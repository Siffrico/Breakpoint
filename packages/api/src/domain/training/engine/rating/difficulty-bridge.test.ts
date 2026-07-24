import { describe, expect, it } from "vitest";

import type { DifficultyVector, ScenarioFormat } from "@acme/validators";

import {
  countVector,
  deriveCanonicalDifficultyBands,
  predictItemRating,
} from "./difficulty-bridge";
import { DEFAULT_RATING_POLICY } from "./policy";

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
    [frqFormat, [1000, 1475]],
  ])("derives reachable canonical bands for $kind", (format, [floor, peak]) => {
    const bands = deriveCanonicalDifficultyBands(format);

    expect(bands).toHaveLength(3);
    expect(bands[0]?.minRating).toBe(floor);
    expect(bands.at(-1)?.maxRating).toBe(peak);
  });

  // The bug this guards: frq's base was 1050, putting band 0's floor at 1105
  // — 105 points above a fresh learner. decideNextScenario then clamped their
  // Goldilocks target up into a band they could not reach, so the first
  // scenario ran at ~37% expected success instead of 70%, and every early pass
  // registered as a large surprise that rocketed the rating.
  it.each(["mcq", "frq"] as const)(
    "keeps the easiest %s scenario at or below the baseline learner",
    (kind) => {
      const bands = deriveCanonicalDifficultyBands({
        id: kind,
        label: kind,
        kind,
        description: kind,
      });
      expect(bands[0]?.minRating).toBeLessThanOrEqual(
        DEFAULT_RATING_POLICY.baselineRating,
      );
    },
  );

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
