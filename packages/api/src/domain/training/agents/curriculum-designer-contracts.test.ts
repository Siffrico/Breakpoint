import assert from "node:assert/strict";
import { test } from "vitest";

import type { DifficultyBand } from "../engine/rating";
import { expandUnitBands, validateDifficultyBands } from "../engine/rating";
import { CurriculumPlanDraftSchema } from "./contracts";

const topCeilingOf = (bands: readonly DifficultyBand[]): number => {
  const top = bands.at(-1);
  assert.ok(top, "expected at least one difficulty band");
  return top.maxRating;
};

const buildUnit = (index: number) => ({
  title: `Handle realistic job case ${index + 1}`,
  learningGoal:
    "Given a realistic trigger cue, choose the next expert move and explain the tradeoff. The learner must avoid a plausible surrogate and produce a checkable decision.",
});

const buildDraft = (
  unitCount: number,
  bandRamp = { startRating: 1300, peakRating: 1700 },
) => ({
  title: "Production debugging operator",
  summary: "A job-first curriculum for production debugging.",
  targetIdentity: "Production debugging operator",
  clusters: [
    {
      title: "Diagnose incidents and choose the next probe",
      summary: "Handle real incident evidence under ambiguity.",
      whyItMatters:
        "The learner must make the right diagnostic move under pressure.",
      units: Array.from({ length: unitCount }, (_unused, index) =>
        buildUnit(index),
      ),
      bandRamp,
      simulation: {
        title: "Incident diagnosis simulation",
        summary: "Diagnose a production incident from partial signals.",
        whyItMatters: "This proves the job can be performed as a whole.",
      },
    },
  ],
  integrationLayers: [],
});

void test("curriculum plan draft accepts a load-bearing cluster with a band ramp", () => {
  assert.doesNotThrow(() => CurriculumPlanDraftSchema.parse(buildDraft(10)));
});

void test("curriculum plan draft accepts the minimum cluster size", () => {
  assert.doesNotThrow(() => CurriculumPlanDraftSchema.parse(buildDraft(8)));
});

void test("curriculum plan draft rejects undersized job clusters", () => {
  assert.throws(
    () => CurriculumPlanDraftSchema.parse(buildDraft(3)),
    /too small|at least 8/i,
  );
});

void test("curriculum plan draft rejects an inverted band ramp", () => {
  assert.throws(
    () =>
      CurriculumPlanDraftSchema.parse(
        buildDraft(10, { startRating: 1700, peakRating: 1300 }),
      ),
    /peakRating must be greater than startRating/i,
  );
});

void test("expandUnitBands derives a valid rising 0/1/2 ladder per unit", () => {
  const unitCount = 12;
  const ramp = { startRating: 1300, peakRating: 1900 };

  let previousTopCeiling: number | null = null;

  for (let index = 0; index < unitCount; index += 1) {
    const bands = expandUnitBands(index, unitCount, ramp);

    // Each unit's ladder is internally valid (contiguous, rising).
    assert.doesNotThrow(() => validateDifficultyBands(bands));
    assert.equal(bands.length, 3);
    assert.deepEqual(
      bands.map((band) => band.order),
      [0, 1, 2],
    );

    // Top-band ceilings never drop across the cluster.
    const topCeiling = topCeilingOf(bands);
    if (previousTopCeiling != null) {
      assert.ok(
        topCeiling >= previousTopCeiling,
        `unit ${index} ceiling ${topCeiling} dropped below ${previousTopCeiling}`,
      );
    }
    previousTopCeiling = topCeiling;
  }

  // First unit sits at the ramp start; last unit reaches the peak.
  assert.equal(topCeilingOf(expandUnitBands(0, unitCount, ramp)), 1300);
  assert.equal(
    topCeilingOf(expandUnitBands(unitCount - 1, unitCount, ramp)),
    1900,
  );
});

void test("expandUnitBands handles a single-unit cluster", () => {
  const bands = expandUnitBands(0, 1, { startRating: 1100, peakRating: 1500 });
  assert.doesNotThrow(() => validateDifficultyBands(bands));
  assert.equal(topCeilingOf(bands), 1100);
});

void test("expandUnitBands rejects a degenerate ramp", () => {
  assert.throws(
    () => expandUnitBands(0, 5, { startRating: 1500, peakRating: 1500 }),
    /peakRating .* must be greater than startRating/i,
  );
});
