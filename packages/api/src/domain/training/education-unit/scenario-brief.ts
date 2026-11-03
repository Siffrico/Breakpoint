import { z } from "zod/v4";

import type { PersistedUnitRun } from "./unit-state";
import { activeRound, openParts } from "./unit-state";

/**
 * The learner-facing read of the challenge currently on the board: initial
 * state (A), desired state (B), and any complications.
 */
export const ScenarioBriefSchema = z.object({
  stateA: z.string(),
  stateB: z.string(),
  frictionNoise: z.string().nullable(),
});

export type ScenarioBrief = z.infer<typeof ScenarioBriefSchema>;

/**
 * Projects only learner-safe fields of the round on the board: its shared
 * situation and open parts as the initial state (A), and the criteria those
 * parts test as the desired state (B). Null while the learner is in a lesson
 * or between parts.
 */
export const projectScenarioBrief = (
  run: PersistedUnitRun | null,
): ScenarioBrief | null => {
  const round = run ? activeRound(run.cursor) : null;
  const parts = run ? openParts(run.cursor) : [];
  if (!run || !round || parts.length === 0) return null;
  const tested = new Set(parts.flatMap((part) => part.criterionIds));
  return {
    stateA: [round.narrative, ...parts.map((part) => part.question)].join(
      "\n\n",
    ),
    stateB: run.unitContext.judgment.criteria
      .filter((criterion) => tested.has(criterion.id))
      .map((criterion) => criterion.criterion)
      .join("\n"),
    frictionNoise: null,
  };
};
