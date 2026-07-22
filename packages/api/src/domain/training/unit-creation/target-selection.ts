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
//   skillset (units under an ability)  — consolidation. Rotate which child
//     skill the unit draws from, so successive units alternate. Interleaving
//     happens BETWEEN units; each unit itself stays focused on one skill.
//
// Both selectors are pure and independently testable. The Effect-returning
// wrapper exists only because the skillset selector needs recent unit history,
// which is a database read.

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
   * Skill that owns this item. Only meaningful on a skillset frontier, which
   * spans an ability's child skills; a foundation frontier is single-skill by
   * construction and leaves it unset.
   */
  ownerSkillId?: string | null;
}

export type UnitCreationRegime = "foundation" | "skillset" | null;

/** Max knowledge items one foundation sitting can give real reps to. */
export const FOUNDATION_UNIT_KNOWLEDGE_CAP = 4;

/**
 * How many recent units the skillset selector looks back over when deciding
 * which skills are "already covered". Kept just under a typical ability's
 * skill count so the filter rotates rather than starves.
 */
export const SKILLSET_INTERLEAVE_WINDOW = 2;

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
 * Skillset: one skill per unit, rotating across units.
 *
 * `entries` arrives weakest-coverage-first, so the lead entry is the ability's
 * softest spot. `recentSkillIds` are the skills the last few units already
 * drew from, most recent first; the lead skips them so consecutive units land
 * on different skills. When every remaining skill is in the window (an ability
 * with fewer skills than the window, or a frontier narrowed to one skill) the
 * filter is dropped rather than returning nothing — rotating is a preference,
 * producing a unit is a requirement.
 *
 * The returned entries all share one owning skill: the variety belongs between
 * units, not inside one.
 */
export const selectInterleavedTargets = (
  entries: readonly FrontierItem[],
  complexityBudget: 1 | 2 | 3,
  recentSkillIds: readonly string[],
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

  const recent = new Set(recentSkillIds);
  const lead =
    unchecked.find((entry) => !recent.has(ownerOf(entry))) ?? unchecked[0];
  if (!lead) return recentlyCheckedFallback(entries, complexityBudget);

  const owner = ownerOf(lead);
  return unchecked
    .filter((entry) => ownerOf(entry) === owner)
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
   * Owning skill ids of the entries the last `limit` units under this ability
   * targeted, most recent unit first, de-duplicated. Empty for a foundation
   * cluster or an ability with no completed units.
   */
  recentTargetSkillIds: (input: {
    skillNodeId: string;
    limit: number;
  }) => Effect.Effect<readonly string[], DbError>;
}

/**
 * The default wiring: dispatch on the regime the frontier arrived with. Held
 * as a dependency rather than an inline branch so a caller can substitute a
 * selector (tests, an experiment, a future regime) without touching the unit
 * creation flow.
 */
export const createRegimeTargetSelector =
  ({
    recentTargetSkillIds,
  }: RegimeTargetSelectorDependencies): UnitTargetSelector =>
  ({ skillNodeId, regime, entries, complexityBudget }) =>
    regime === "skillset"
      ? Effect.map(
          recentTargetSkillIds({
            skillNodeId,
            limit: SKILLSET_INTERLEAVE_WINDOW,
          }),
          (recentSkillIds) =>
            selectInterleavedTargets(entries, complexityBudget, recentSkillIds),
        )
      : Effect.succeed(selectSequentialTargets(entries, complexityBudget));
