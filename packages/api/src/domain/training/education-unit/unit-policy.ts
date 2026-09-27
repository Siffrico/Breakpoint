import type {
  UnitOutcome,
  UnitRoundSpec,
  UnitStep,
} from "@acme/validators";

/**
 * The unit's structure, and the only file that knows it. Everything else
 * records what happened and carries out the move this returns, so reshaping a
 * unit means editing this file and nothing else.
 *
 *   Teach → Learn round (part by part) → Exam round (all at once)
 *     exam passes            → complete, mastered
 *     exam misses            → Learn round on the missed criteria → Exam …
 *     "never learned it"     → Teach again first
 *     MAX_FAILED_EXAMS hit   → complete, not mastered (recall brings it back)
 */

export type UnitRoundStep = Extract<UnitStep, { kind: "round" }>;
type UnitRoundTemplate = Omit<UnitRoundSpec, "criterionIds">;

export type UnitMove =
  | { readonly kind: "teach" }
  | { readonly kind: "open_round"; readonly spec: UnitRoundSpec }
  | { readonly kind: "next_part" }
  | { readonly kind: "complete"; readonly outcome: UnitOutcome };

const LEARN: UnitRoundTemplate = {
  label: "learn",
  pacing: "part_by_part",
  partCount: 3,
  rated: false,
  mustPass: false,
};

const EXAM: UnitRoundTemplate = {
  label: "exam",
  pacing: "all_at_once",
  partCount: 3,
  rated: true,
  mustPass: true,
};

/** A grader that is too strict must not trap a learner in one unit forever. */
const MAX_FAILED_EXAMS = 3;
/** A lesson that has not landed after this many tries will not land by repeating it. */
const MAX_LESSONS = 3;

const openRound = (
  template: UnitRoundTemplate,
  criterionIds: readonly string[],
): UnitMove => ({
  kind: "open_round",
  spec: { ...template, criterionIds: [...criterionIds] },
});

export const isRoundStep = (step: UnitStep | undefined): step is UnitRoundStep =>
  step?.kind === "round";

export const findLastRound = (
  steps: readonly UnitStep[],
): UnitRoundStep | null => [...steps].reverse().find(isRoundStep) ?? null;

export const isRoundFinished = (round: UnitRoundStep): boolean =>
  round.parts.length === round.spec.partCount &&
  round.parts.every((part) => part.result !== null);

export const isRoundPassed = (round: UnitRoundStep): boolean =>
  isRoundFinished(round) && round.parts.every((part) => part.result?.met);

/** Criteria some graded part of the round did not meet, in spec order. */
export const missedCriterionIds = (round: UnitRoundStep): string[] => {
  const missed = new Set(
    round.parts.flatMap(
      (part) =>
        part.result?.criterionResults
          .filter((result) => !result.met)
          .map((result) => result.dimensionId) ?? [],
    ),
  );
  return round.spec.criterionIds.filter((id) => missed.has(id));
};

/** Criteria no part of the round has tested yet, in spec order. */
export const uncoveredCriterionIds = (round: UnitRoundStep): string[] => {
  const covered = new Set(round.parts.flatMap((part) => part.criterionIds));
  return round.spec.criterionIds.filter((id) => !covered.has(id));
};

const wasDiagnosedNeverLearned = (round: UnitRoundStep): boolean =>
  round.parts.some((part) => part.result?.causeType === "never-learned-it");

const countLessons = (steps: readonly UnitStep[]): number =>
  steps.filter((step) => step.kind === "teach").length;

const countFailedMustPassRounds = (steps: readonly UnitStep[]): number =>
  steps.filter(
    (step) =>
      isRoundStep(step) &&
      step.spec.mustPass &&
      isRoundFinished(step) &&
      !isRoundPassed(step),
  ).length;

/** What a lesson that interrupted a round should send the learner back to. */
const criteriaToRelearn = (round: UnitRoundStep): string[] => {
  const missed = missedCriterionIds(round);
  return round.spec.mustPass && missed.length > 0
    ? missed
    : round.spec.criterionIds;
};

/**
 * The next thing the unit does, from its history alone. Call it when the
 * learner has nothing left to answer: before the first lesson, after an
 * explain-back, or after a grade.
 */
export const nextMove = (
  steps: readonly UnitStep[],
  unitCriterionIds: readonly string[],
): UnitMove => {
  const lastStep = steps.at(-1);
  if (!lastStep) return { kind: "teach" };
  if (lastStep.kind === "teach") {
    const interruptedRound = findLastRound(steps);
    return openRound(
      LEARN,
      interruptedRound
        ? criteriaToRelearn(interruptedRound)
        : unitCriterionIds,
    );
  }
  const finished = isRoundFinished(lastStep);
  if (finished && lastStep.spec.mustPass) {
    if (isRoundPassed(lastStep)) {
      return { kind: "complete", outcome: "mastered" };
    }
    if (countFailedMustPassRounds(steps) >= MAX_FAILED_EXAMS) {
      return { kind: "complete", outcome: "not_mastered" };
    }
  }
  if (
    wasDiagnosedNeverLearned(lastStep) &&
    countLessons(steps) < MAX_LESSONS
  ) {
    return { kind: "teach" };
  }
  if (!finished) return { kind: "next_part" };
  return lastStep.spec.mustPass
    ? openRound(LEARN, missedCriterionIds(lastStep))
    : openRound(EXAM, unitCriterionIds);
};
