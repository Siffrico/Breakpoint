/**
 * Concept coverage — the foundation regime's mastery math.
 *
 * A skill is criterion-mastered when every one of its concepts has been
 * load-bearing in enough scored solves. No rating is consulted: a skill
 * learned twentieth is judged against exactly the same bar as a skill learned
 * first, which is the fairness invariant the v2 hierarchy exists for. The
 * ability ELO lives entirely in the skillset regime (engine/rating).
 */

/** How many scored solves each concept must survive before it counts. */
export const CONCEPT_COVERAGE_TARGET = 3;

/**
 * The same bar for an outcome node's syllabus (topic mode), set lower on
 * purpose.
 *
 * Three works for a skill because a skill's concept list is short. An outcome's
 * syllabus spans a whole slice of the topic — commonly 20-30 items — and a unit
 * can only be load-bearing on two or three of them, so a target of three would
 * demand roughly 36 units per outcome, or ~290 across an eight-outcome plan.
 *
 * At one, the gate asks the question it exists to ask: has this learner been
 * tested across the WHOLE syllabus, or only the handful of axes the generator
 * happened to favour? Depth is the rating gate's job, and it runs alongside
 * this one — see plan-progression.ts.
 */
export const SYLLABUS_COVERAGE_TARGET = 1;

export interface CoverageEntry {
  coverageCount: number;
}

/**
 * True when the skill's concept map exists and every concept has reached the
 * coverage target. An empty map is never mastered — a skill without concepts
 * is a mapper failure, not a finished skill.
 */
export const isSkillMastered = (
  entries: readonly CoverageEntry[],
  target: number = CONCEPT_COVERAGE_TARGET,
): boolean =>
  entries.length > 0 && entries.every((entry) => entry.coverageCount >= target);

/** How close the skill is to mastered, for progress UI: 0..1. */
export const coverageProgress = (
  entries: readonly CoverageEntry[],
  target: number = CONCEPT_COVERAGE_TARGET,
): number => {
  if (entries.length === 0) return 0;
  const earned = entries.reduce(
    (sum, entry) => sum + Math.min(entry.coverageCount, target),
    0,
  );
  return earned / (entries.length * target);
};
