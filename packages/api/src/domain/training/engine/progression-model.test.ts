import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_RATING_DEVIATION,
  difficultyRampOf,
  FOUNDATION_RAMP_SPAN,
  foundationCalibrationRamp,
  requireAbilityStage,
  regimeForNodeKind,
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
    expect(resolveProgressionModel({ kind: "skill", skillMap: null })).toBeNull();
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

  it("skillset ability: rating gate from the ramp, no syllabus frontier", () => {
    expect(resolveProgressionModel({ kind: "ability", skillMap })).toEqual({
      regime: "skillset",
      workflow: skillMap.workflow,
      bandRamp: skillMap.bandRamp,
      mastery: {
        peakRating: 1400,
        maxRatingDeviation: DEFAULT_MAX_RATING_DEVIATION,
      },
    });
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
