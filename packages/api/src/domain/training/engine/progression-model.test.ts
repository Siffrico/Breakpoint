import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_RATING_DEVIATION,
  difficultyRampOf,
  FOUNDATION_RAMP_SPAN,
  foundationCalibrationRamp,
  masteryRatingOf,
  regimeForNodeKind,
  requireAbilityStage,
  resolveProgressionModel,
} from "./progression-model";

const skillMap = {
  workflow: { name: "Debug", steps: ["observe", "isolate", "fix"] },
  bandRamp: { startRating: 1000, peakRating: 1400 },
  masteryContract: { exitCriteria: ["ships a fix"] },
  scenarioArchetype: "judge" as const,
};

describe("regimeForNodeKind", () => {
  it("maps each kind to exactly one regime", () => {
    expect(regimeForNodeKind("skill")).toBe("foundation");
    expect(regimeForNodeKind("ability")).toBe("skillset");
    expect(regimeForNodeKind("unit")).toBeNull();
    expect(regimeForNodeKind("root")).toBeNull();
  });
});

describe("resolveProgressionModel", () => {
  it("returns null for nodes outside the mastery loop", () => {
    expect(resolveProgressionModel({ kind: "unit", skillMap })).toBeNull();
    expect(
      resolveProgressionModel({ kind: "skill", skillMap: null }),
    ).toBeNull();
  });

  it("foundation: carries no rating gate, only a calibration ramp", () => {
    const model = resolveProgressionModel({ kind: "skill", skillMap });
    expect(model).toMatchObject({
      regime: "foundation",
      calibrationRamp: {
        startRating: 1000,
        peakRating: 1000 + FOUNDATION_RAMP_SPAN,
      },
    });
    // The type makes a mastery rating gate unrepresentable for foundation.
    expect(model && "mastery" in model).toBe(false);
  });

  it("skillset ability: gates on the top band's midpoint, never its ceiling", () => {
    const model = resolveProgressionModel({ kind: "ability", skillMap });
    expect(model).toEqual({
      regime: "skillset",
      workflow: skillMap.workflow,
      bandRamp: skillMap.bandRamp,
      mastery: {
        masteryRating: masteryRatingOf(null, skillMap.bandRamp),
        maxRatingDeviation: DEFAULT_MAX_RATING_DEVIATION,
      },
    });
    // The ceiling is the hardest scenario the archetype can express; a learner
    // sitting inside the top band never converges to it, which is what used to
    // leave abilities unmasterable.
    expect(
      model?.regime === "skillset" && model.mastery.masteryRating,
    ).toBeLessThan(skillMap.bandRamp.peakRating);
  });

  it("prefers the node's own bands over the ramp's expansion", () => {
    const difficultyBands = [
      { order: 0, minRating: 900, maxRating: 1100 },
      { order: 1, minRating: 1100, maxRating: 1300 },
      { order: 2, minRating: 1300, maxRating: 1500 },
    ];
    const model = resolveProgressionModel({
      kind: "ability",
      skillMap,
      difficultyBands,
    });
    expect(model?.regime === "skillset" && model.mastery.masteryRating).toBe(
      1400,
    );
  });
});

describe("masteryRatingOf", () => {
  it("takes the highest-order band, whatever order they arrive in", () => {
    expect(
      masteryRatingOf(
        [
          { order: 2, minRating: 1300, maxRating: 1500 },
          { order: 0, minRating: 900, maxRating: 1100 },
          { order: 1, minRating: 1100, maxRating: 1300 },
        ],
        skillMap.bandRamp,
      ),
    ).toBe(1400);
  });

  it("falls back to the ramp when a node carries no bands", () => {
    expect(masteryRatingOf([], skillMap.bandRamp)).toBe(
      masteryRatingOf(null, skillMap.bandRamp),
    );
  });
});

describe("difficultyRampOf", () => {
  it("reads the calibration ramp for foundation and the real ramp for skillset", () => {
    const foundation = resolveProgressionModel({ kind: "skill", skillMap });
    const skillset = resolveProgressionModel({ kind: "ability", skillMap });
    expect(foundation && difficultyRampOf(foundation)).toEqual(
      foundationCalibrationRamp(skillMap.bandRamp),
    );
    expect(skillset && difficultyRampOf(skillset)).toEqual(skillMap.bandRamp);
  });
});

describe("requireAbilityStage", () => {
  it("rejects a missing or invalid stage", () => {
    expect(requireAbilityStage("foundations")).toBe("foundations");
    expect(() => requireAbilityStage("ready")).toThrow();
    expect(() => requireAbilityStage(null)).toThrow();
  });
});
