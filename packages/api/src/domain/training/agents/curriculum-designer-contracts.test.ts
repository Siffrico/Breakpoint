import assert from "node:assert/strict";
import { test } from "vitest";

import type { DifficultyBand } from "../engine/rating";
import {
  expandSkillBands,
  expandUnitBands,
  validateDifficultyBands,
} from "../engine/rating";
import { CurriculumPlanDraftSchema } from "./contracts";

const topCeilingOf = (bands: readonly DifficultyBand[]): number => {
  const top = bands.at(-1);
  assert.ok(top, "expected at least one difficulty band");
  return top.maxRating;
};

const buildDraft = (
  abilityCount: number,
  bandRamp = { startRating: 1300, peakRating: 1700 },
  skillCount = 3,
) => ({
  title: "Production debugging operator",
  summary: "A job-first curriculum for production debugging.",
  targetIdentity: "Production debugging operator",
  abilities: Array.from({ length: abilityCount }, (_, index) => ({
    title: `Diagnose incidents and choose the next probe ${index + 1}`,
    summary: "Handle real incident evidence under ambiguity.",
    whyItMatters:
      "The learner must make the right diagnostic move under pressure.",
    workflow: {
      name: "Diagnose a production incident",
      steps: ["Collect signals", "Separate hypotheses", "Choose a probe"],
    },
    bandRamp,
    masteryContract: {
      exitCriteria: ["Chooses a discriminating probe from partial evidence."],
    },
    skills: Array.from({ length: skillCount }, (_, skillIndex) => ({
      title: `Read incident evidence ${skillIndex + 1}`,
      summary: "Pull the discriminating signal out of noisy evidence.",
      whyItMatters: "Wrong reads waste the incident's time box.",
      workflow: {
        name: "Read incident evidence",
        steps: ["Collect signals", "Rank hypotheses", "Name the gap"],
      },
      masteryContract: {
        exitCriteria: ["Names the discriminating signal from raw evidence."],
      },
    })),
  })),
});

void test("curriculum plan draft accepts a load-bearing ability with a band ramp", () => {
  assert.doesNotThrow(() => CurriculumPlanDraftSchema.parse(buildDraft(4)));
});

void test("curriculum plan draft accepts the minimum ability count", () => {
  assert.doesNotThrow(() => CurriculumPlanDraftSchema.parse(buildDraft(2)));
});

void test("curriculum plan draft rejects too few abilities", () => {
  assert.throws(
    () => CurriculumPlanDraftSchema.parse(buildDraft(1)),
    /too small|at least 2/i,
  );
});

void test("curriculum plan draft rejects an ability with too few skills", () => {
  assert.throws(
    () =>
      CurriculumPlanDraftSchema.parse(
        buildDraft(3, { startRating: 1300, peakRating: 1700 }, 2),
      ),
    /too small|at least 3/i,
  );
});

void test("curriculum plan draft rejects an inverted band ramp", () => {
  assert.throws(
    () =>
      CurriculumPlanDraftSchema.parse(
        buildDraft(3, { startRating: 1700, peakRating: 1300 }),
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

void test("expandSkillBands produces one canonical ladder ending at peak", () => {
  const bands = expandSkillBands({ startRating: 1100, peakRating: 1700 });
  assert.doesNotThrow(() => validateDifficultyBands(bands));
  assert.equal(bands.length, 3);
  assert.equal(bands.at(-1)?.maxRating, 1700);
});
