import assert from "node:assert/strict";
import test from "node:test";

import { CurriculumPlanDraftSchema } from "./contracts";

const buildUnit = (index: number, topCeiling: number) => ({
  title: `Handle realistic job case ${index + 1}`,
  learningGoal:
    "Given a realistic trigger cue, choose the next expert move and explain the tradeoff. The learner must avoid a plausible surrogate and produce a checkable decision.",
  difficultyBands: [
    {
      order: 0,
      minRating: topCeiling - 600,
      maxRating: topCeiling - 400,
      label: "Supported case",
    },
    {
      order: 1,
      minRating: topCeiling - 400,
      maxRating: topCeiling - 200,
      label: "Messy case",
    },
    {
      order: 2,
      minRating: topCeiling - 200,
      maxRating: topCeiling,
      label: "Transfer case",
    },
  ],
});

const buildDraft = (ceilings: number[]) => ({
  title: "Production debugging operator",
  summary: "A job-first curriculum for production debugging.",
  targetIdentity: "Production debugging operator",
  clusters: [
    {
      title: "Diagnose incidents and choose the next probe",
      summary: "Handle real incident evidence under ambiguity.",
      whyItMatters:
        "The learner must make the right diagnostic move under pressure.",
      units: ceilings.map((ceiling, index) => buildUnit(index, ceiling)),
      simulation: {
        title: "Incident diagnosis simulation",
        summary: "Diagnose a production incident from partial signals.",
        whyItMatters: "This proves the job can be performed as a whole.",
      },
    },
  ],
  integrationLayers: [],
});

void test("curriculum plan draft accepts 20-30 job units with a rising ELO ramp", () => {
  const draft = buildDraft(
    Array.from({ length: 20 }, (_, index) => 1300 + index * 20),
  );

  assert.doesNotThrow(() => CurriculumPlanDraftSchema.parse(draft));
});

void test("curriculum plan draft rejects an inverted unit ELO ramp", () => {
  const ceilings = Array.from({ length: 20 }, (_, index) => 1300 + index * 20);
  ceilings[10] = 1479;

  assert.throws(
    () => CurriculumPlanDraftSchema.parse(buildDraft(ceilings)),
    /top band ceiling/i,
  );
});

void test("curriculum plan draft rejects undersized job clusters", () => {
  assert.throws(
    () => CurriculumPlanDraftSchema.parse(buildDraft([1300, 1320, 1340])),
    /too small|at least 20/i,
  );
});
