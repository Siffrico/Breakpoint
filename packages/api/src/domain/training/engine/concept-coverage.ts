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
