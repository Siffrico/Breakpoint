import { z } from "zod/v4";

import type { PersistedUnitRun } from "./unit-state";

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
 * Projects only learner-safe fields from the private review contract.
 *
 * `activeReviewChallenge` is itself a projection of the run's todo list, so
 * this brief is always the *current pass's* scenario — never a stale one. It
 * lives here rather than in the workspace read so the turn stream can project
 * the same brief from the run it just wrote, without either path importing the
 * other.
 */
export const projectScenarioBrief = (
  run: PersistedUnitRun | null,
): ScenarioBrief | null => {
  const challenge = run?.activeReviewChallenge;
  if (!challenge) return null;
  const tested = new Set(challenge.contract.testedCriterionIds);

  return {
    stateA: challenge.prompt,
    stateB: run.unitContext.judgment.criteria
      .filter((criterion) => tested.has(criterion.id))
      .map((criterion) => criterion.criterion)
      .join("\n"),
    frictionNoise: null,
  };
};
