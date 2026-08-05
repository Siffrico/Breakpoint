// unit-creation/target-selection.ts
//
// Which knowledge items the next unit is accountable for. This is the ONE
// thing that differs between the two unit types; everything else about unit
// creation (loading the frontier, resolving the Goldilocks directive, writing
// the node) is shared and lives in create-next-unit.ts.
//
//   foundation (units under a skill)   — acquisition. Walk the skill's list in
//     prerequisite order, taking the next unchecked concepts. Blocked practice:
//     interleaving during initial acquisition costs more than it buys.
//   skillset (units under an ability)  — consolidation. Every unit is one rep
//     of one child skill, and the next unit always goes to the skill with the
//     fewest reps. Interleaving happens BETWEEN units; each unit itself stays
//     focused on one skill.
//
// Both selectors are pure and independently testable. The Effect-returning
// wrapper exists only because the skillset selector needs the ability's
// practice history, which is a database read.

import { Effect } from "effect";

import type { DbError } from "../../../effect/errors";

export interface FrontierItem {
  id: string;
  questionId: string;
  question: string;
  questionOrderIndex: number;
  kind: "concept" | "mechanism";
  label: string;
  content: string;
  status: string;
  /** Position in the owning skill's dependency-ordered knowledge list. */
  orderIndex: number;
  /**
   * Scored solves this entry has already been load-bearing in. Only the
   * main_outcome selector reads it; the other two order by dependency and
   * rep count instead.
   */
  coverageCount?: number;
  /**
   * Skill that owns this item. Only meaningful on a skillset frontier, which
   * spans an ability's child skills; a foundation frontier is single-skill by
   * construction and leaves it unset.
   */
  ownerSkillId?: string | null;
}

export type UnitCreationRegime =
  | "foundation"
  | "skillset"
  | "main_outcome"
  | null;

/** Max knowledge items one foundation sitting can give real reps to. */
export const FOUNDATION_UNIT_KNOWLEDGE_CAP = 4;

/**
 * Completed skillset units each child skill must earn before its ability can
 * be mastered. Three is the smallest count that separates "did it once" from
 * "can do it" while still leaving the reps far enough apart to be retrieval
 * rather than repetition — with N skills, a skill's reps are always N units
 * apart (see {@link selectInterleavedTargets}).
 */
export const SKILL_REP_TARGET = 3;

/** One child skill's skillset practice record under its ability. */
export interface SkillPractice {
  skillId: string;
  /** Completed skillset units that were a rep of this skill. */
  reps: number;
  /** When the most recent of those units was created; null when never practiced. */
  lastPracticedAt: Date | null;
}

/** The breadth half of the skillset mastery gate (see plan-progression.ts). */
export const countSkillsBelowRepTarget = (
  practice: readonly SkillPractice[],
  repTarget: number = SKILL_REP_TARGET,
): number => practice.filter((skill) => skill.reps < repTarget).length;

export const sliceFrontier = (
  entries: readonly FrontierItem[],
  complexityBudget: 1 | 2 | 3,
): FrontierItem[] =>
  entries
    .filter((entry) => entry.status === "unchecked")
    .slice(0, complexityBudget);

const uncheckedOf = (entries: readonly FrontierItem[]): FrontierItem[] =>
  entries.filter((entry) => entry.status === "unchecked");

/**
 * Nothing new is left to teach. Re-running the most recently checked entries
 * keeps the mastery loop producing units instead of stalling; the progression
 * engine, not this selector, decides when the node is actually done.
 */
const recentlyCheckedFallback = (
  entries: readonly FrontierItem[],
  complexityBudget: 1 | 2 | 3,
): FrontierItem[] => {
  const checked = entries.filter((entry) => entry.status === "checked");
  const last = checked.at(-1);
  if (!last) return [];
  return checked
    .filter((entry) => entry.questionId === last.questionId)
    .slice(-complexityBudget);
};

/**
 * Foundation: keep one authored question intact, splitting only when its item
 * count exceeds what one sitting can carry.
 */
export const selectSequentialTargets = (
  entries: readonly FrontierItem[],
  complexityBudget: 1 | 2 | 3,
): FrontierItem[] => {
  const unchecked = uncheckedOf(entries);
  const nextQuestionId = unchecked[0]?.questionId;
  const frontier = nextQuestionId
    ? unchecked
        .filter((entry) => entry.questionId === nextQuestionId)
        .slice(0, FOUNDATION_UNIT_KNOWLEDGE_CAP)
    : [];
  return frontier.length > 0
    ? frontier
    : recentlyCheckedFallback(entries, complexityBudget);
};

/**
 * Ordering key for the round-robin: fewest reps first, then least recently
 * practiced. A skill with no practice record has never been picked, so it
 * ranks ahead of everything.
 */
const practiceRankOf = (
  practice: SkillPractice | undefined,
): [reps: number, lastPracticedAt: number] => [
  practice?.reps ?? 0,
  practice?.lastPracticedAt?.getTime() ?? 0,
];

/**
 * Skillset: one skill per unit, always the least-practiced one.
 *
 * This is the whole interleaving policy, and its guarantee is structural rather
 * than procedural: because the pick is always the minimum rep count, no skill
 * reaches rep N + 1 until every skill has reached rep N. Nothing can starve —
 * a skipped skill's rep count stays lowest, so it wins the very next pick — and
 * spacing falls out for free, since a skill's consecutive reps are separated by
 * one rep of every other skill. That replaces the old fixed-size recency
 * window, which guaranteed neither: with more skills than the window, several
 * could go unpracticed indefinitely.
 *
 * Ties break on `entries` order, which arrives weakest-coverage-first, so the
 * ability's softest spot leads among equally-practiced skills.
 *
 * The returned entries all share one owning skill: the variety belongs between
 * units, not inside one.
 */
export const selectInterleavedTargets = (
  entries: readonly FrontierItem[],
  complexityBudget: 1 | 2 | 3,
  practice: readonly SkillPractice[],
): FrontierItem[] => {
  const unchecked = uncheckedOf(entries);
  if (unchecked.length === 0) {
    return recentlyCheckedFallback(entries, complexityBudget);
  }

  // An entry with no owning skill is its own group, so a frontier that predates
  // ownerSkillId degrades to "one entry per unit" instead of grouping unrelated
  // entries together.
  const ownerOf = (entry: FrontierItem): string =>
    entry.ownerSkillId ?? entry.id;

  const practiceBySkillId = new Map(
    practice.map((skill) => [skill.skillId, skill]),
  );

  let lead = unchecked[0];
  if (!lead) return recentlyCheckedFallback(entries, complexityBudget);
  let leadRank = practiceRankOf(practiceBySkillId.get(ownerOf(lead)));
  for (const entry of unchecked) {
    const rank = practiceRankOf(practiceBySkillId.get(ownerOf(entry)));
    if (
      rank[0] < leadRank[0] ||
      (rank[0] === leadRank[0] && rank[1] < leadRank[1])
    ) {
      lead = entry;
      leadRank = rank;
    }
  }

  const owner = ownerOf(lead);
  return unchecked
    .filter((entry) => ownerOf(entry) === owner)
    .slice(0, complexityBudget);
};

/**
 * Topic mode: the least-covered axes of this outcome's syllabus.
 *
 * The outcome's demand never changes, so what a unit is *for* is covering a
 * part of the syllabus the learner has not been tested on yet. Taking the
 * minimum coverage first gives the same no-starvation guarantee the skillset
 * round-robin has: nothing can be skipped indefinitely, because a skipped
 * entry's coverage stays lowest and it wins the very next pick.
 *
 * Ties break on `orderIndex`, which arrives in the designer's dependency order,
 * so among equally-uncovered axes the earlier one leads.
 */
export const selectLeastCoveredTargets = (
  entries: readonly FrontierItem[],
  complexityBudget: 1 | 2 | 3,
): FrontierItem[] => {
  // Once every axis is checked off, the breadth gate is satisfied but the
  // rating climb usually is not, so units keep coming. They are drawn from the
  // whole syllabus by the same least-covered rule rather than from the shared
  // recently-checked fallback, which replays one authored question and would
  // spend the entire remaining climb on whichever axis happened to be last.
  const unchecked = uncheckedOf(entries);
  const pool = unchecked.length > 0 ? unchecked : entries;
  return [...pool]
    .sort(
      (left, right) =>
        (left.coverageCount ?? 0) - (right.coverageCount ?? 0) ||
        left.questionOrderIndex - right.questionOrderIndex ||
        left.orderIndex - right.orderIndex,
    )
    .slice(0, complexityBudget);
};

export interface UnitTargetSelectorInput {
  /** The skill or ability the unit is being created under. */
  skillNodeId: string;
  regime: UnitCreationRegime;
  entries: readonly FrontierItem[];
  complexityBudget: 1 | 2 | 3;
}

export type UnitTargetSelector = (
  input: UnitTargetSelectorInput,
) => Effect.Effect<readonly FrontierItem[], DbError>;

export interface RegimeTargetSelectorDependencies {
  /**
   * Every child skill of this ability with its completed-unit rep count. Skills
   * with no completed units are still present, at zero reps — the round-robin
   * needs the full roster to know what it has not reached yet, so a query that
   * only returned practiced skills would silently starve the untouched ones.
   */
  skillPracticeHistory: (input: {
    abilityNodeId: string;
  }) => Effect.Effect<readonly SkillPractice[], DbError>;
}

/**
 * The default wiring: dispatch on the regime the frontier arrived with. Held
 * as a dependency rather than an inline branch so a caller can substitute a
 * selector (tests, an experiment, a future regime) without touching the unit
 * creation flow.
 */
export const createRegimeTargetSelector =
  ({
    skillPracticeHistory,
  }: RegimeTargetSelectorDependencies): UnitTargetSelector =>
  ({ skillNodeId, regime, entries, complexityBudget }) => {
    switch (regime) {
      case "skillset":
        return Effect.map(
          skillPracticeHistory({ abilityNodeId: skillNodeId }),
          (practice) =>
            selectInterleavedTargets(entries, complexityBudget, practice),
        );
      case "main_outcome":
        return Effect.succeed(
          selectLeastCoveredTargets(entries, complexityBudget),
        );
      default:
        return Effect.succeed(
          selectSequentialTargets(entries, complexityBudget),
        );
    }
  };
