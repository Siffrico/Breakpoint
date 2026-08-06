import { Match } from "effect";

import type {
  CurriculumNodeKind,
  CurriculumNodeStatus,
} from "../types/training.types";
import type { AbilityStage } from "./progression-model";
import { DEFAULT_MAX_RATING_DEVIATION } from "./progression-model";

/**
 * Pure curriculum-progression engine.
 *
 * It answers two questions with no database coupling: when a node is completed,
 * which statuses change, and which node (if any) unlocks next. The repository
 * loads the plan's nodes, calls these functions, and persists the returned
 * {@link StatusChange}s. Keeping the rules here makes them unit-testable without
 * a database and removes the parent-rollup logic that was previously
 * copy-pasted across the repository's completion methods.
 */

/** The minimal node view the engine reasons over — a projection of the row. */
export interface ProgressionNode {
  id: string;
  parentNodeId: string | null;
  kind: CurriculumNodeKind;
  status: CurriculumNodeStatus;
  orderIndex: number;
}

/** One intended status mutation; the repository applies each as a single update. */
export interface StatusChange {
  nodeId: string;
  status: CurriculumNodeStatus;
}

/** One intended ability-stage mutation (see progression-model.ts AbilityStage). */
export interface StageChange {
  nodeId: string;
  stage: AbilityStage;
}

export type MasteryProgressionDecision =
  | { intent: "create_unit" }
  | { intent: "node_complete" };

/**
 * The two-regime progression state, keyed on the unit's skillMap-bearing
 * parent:
 *
 *   - "foundation" (parent is a `skill`): criterion-referenced. Mastered when
 *     every concept has reached the coverage target. No rating is consulted —
 *     concept #20 is judged exactly like concept #1.
 *   - "skillset" (parent is an `ability`): consolidation across the ability's
 *     skills. Mastered only when BOTH gates hold — every child skill has earned
 *     its reps (breadth) and the rating has settled at the top band (depth).
 *     Either alone is a false positive: a pile of easy reps is not mastery, and
 *     one lucky hard win on one skill is not either.
 */
export type MasteryProgressionState =
  | {
      regime: "foundation";
      entries: readonly { coverageCount: number }[];
      coverageTarget: number;
    }
  | {
      regime: "skillset";
      /** Child skills still short of the rep target — the breadth gate. */
      skillsBelowRepTarget: number;
      learnerRating: number;
      ratingDeviation: number;
      /** Midpoint of the top band; see masteryRatingOf in progression-model.ts. */
      masteryRating: number;
      maxRatingDeviation?: number;
    }
  | {
      /**
       * Topic mode. Same two-gate structure as skillset, but breadth is the
       * outcome's own syllabus coverage: an outcome node has no child skills to
       * count reps against, and its syllabus is exactly the enumeration of what
       * a learner must have been tested across.
       */
      regime: "main_outcome";
      /** Syllabus items still short of the coverage target — the breadth gate. */
      syllabusItemsBelowCoverage: number;
      /** Denominator for the same gate; 0 means the syllabus has not landed. */
      syllabusItemsTotal: number;
      learnerRating: number;
      ratingDeviation: number;
      masteryRating: number;
      maxRatingDeviation?: number;
    };

/** Depth: the rating has settled at the top band, not just touched it. */
const ratingGatePasses = (state: {
  learnerRating: number;
  ratingDeviation: number;
  masteryRating: number;
  maxRatingDeviation?: number;
}): boolean =>
  state.learnerRating >= state.masteryRating &&
  state.ratingDeviation <=
    (state.maxRatingDeviation ?? DEFAULT_MAX_RATING_DEVIATION);

/**
 * How much of an outcome's syllabus must be covered before the NEXT outcome's
 * blueprint is worth generating in the background.
 *
 * Deliberately short of mastery. Generating at 1.0 means the learner waits on a
 * model call at the exact moment they finish; generating much earlier wastes
 * the whole point of deferring, since a blueprint written before the learner
 * has attempted this outcome cannot be informed by how they did.
 */
export const WARM_NEXT_OUTCOME_COVERAGE = 0.8;

/**
 * Whether the outcome the learner is on is close enough to done that its
 * successor should be prepared now. Pure and monotonic: once true it stays
 * true, so a missed tick is caught by the next one rather than lost.
 */
export const shouldWarmNextOutcome = (
  state: MasteryProgressionState,
): boolean => {
  if (state.regime !== "main_outcome") return false;
  // No syllabus means this outcome's own pass B has not landed yet — warming
  // its successor before itself would be building the wrong floor.
  if (state.syllabusItemsTotal === 0) return false;
  const covered =
    1 - state.syllabusItemsBelowCoverage / state.syllabusItemsTotal;
  return covered >= WARM_NEXT_OUTCOME_COVERAGE || ratingGatePasses(state);
};

/**
 * Whether a completed node's progression is owned by the dynamic mastery loop
 * (create_unit/node_complete decisions) instead of list advancement. Only
 * nodes whose parent has a skill map qualify.
 */
export const usesDynamicMasteryLoop = ({
  nodeKind,
  parentHasSkillMap,
}: {
  nodeKind: CurriculumNodeKind;
  parentHasSkillMap: boolean;
}): boolean => nodeKind === "unit" && parentHasSkillMap;

export const decideMasteryProgression: (
  state: MasteryProgressionState,
) => MasteryProgressionDecision = Match.type<MasteryProgressionState>().pipe(
  Match.when({ regime: "foundation" }, (state) => {
    const mastered =
      state.entries.length > 0 &&
      state.entries.every(
        (entry) => entry.coverageCount >= state.coverageTarget,
      );
    return mastered
      ? ({ intent: "node_complete" } as const)
      : ({ intent: "create_unit" } as const);
  }),
  Match.when({ regime: "skillset" }, (state) => {
    const mastered =
      state.skillsBelowRepTarget === 0 && ratingGatePasses(state);
    return mastered
      ? ({ intent: "node_complete" } as const)
      : ({ intent: "create_unit" } as const);
  }),
  Match.when({ regime: "main_outcome" }, (state) => {
    const mastered =
      state.syllabusItemsBelowCoverage === 0 && ratingGatePasses(state);
    return mastered
      ? ({ intent: "node_complete" } as const)
      : ({ intent: "create_unit" } as const);
  }),
  Match.exhaustive,
);

/**
 * What unlocks after a skillMap-bearing node (skill or ability) is mastered.
 * Pure over the plan's nodes; the repository applies the changes and creates
 * the named unit.
 *
 *   skill mastered  → next planned sibling skill's foundation unit,
 *                     or (all skills mastered) the ability's skillset units
 *   ability mastered → the next planned ability's first skill,
 *                     or plan complete
 */
export type SkillMapAdvancement =
  | {
      kind: "foundation_unit";
      skillNodeId: string;
      changes: StatusChange[];
      stageChanges: StageChange[];
    }
  | {
      kind: "skillset_unit";
      abilityNodeId: string;
      changes: StatusChange[];
      stageChanges: StageChange[];
    }
  | {
      /** Topic mode: the next outcome's first unit. */
      kind: "outcome_unit";
      outcomeNodeId: string;
      changes: StatusChange[];
      stageChanges: StageChange[];
    }
  | {
      kind: "plan_complete";
      changes: StatusChange[];
      stageChanges: StageChange[];
    }
  | { kind: "none"; changes: StatusChange[]; stageChanges: StageChange[] };

export const planSkillMapAdvancement = (
  nodes: readonly ProgressionNode[],
  masteredNodeId: string,
): SkillMapAdvancement => {
  const mastered = nodes.find((node) => node.id === masteredNodeId);
  if (!mastered) return { kind: "none", changes: [], stageChanges: [] };

  const changes: StatusChange[] = [
    { nodeId: masteredNodeId, status: "completed" },
  ];
  const stageChanges: StageChange[] = [];
  const ordered = [...nodes].sort((a, b) => a.orderIndex - b.orderIndex);
  const statusOf = (node: ProgressionNode): CurriculumNodeStatus =>
    node.id === masteredNodeId ? "completed" : node.status;

  if (mastered.kind === "skill") {
    const siblingSkills = ordered.filter(
      (node) =>
        node.kind === "skill" && node.parentNodeId === mastered.parentNodeId,
    );
    const nextSkill = siblingSkills.find(
      (node) => node.orderIndex > mastered.orderIndex,
    );
    if (nextSkill) {
      if (statusOf(nextSkill) === "completed") {
        return { kind: "none", changes, stageChanges };
      }
      changes.push({ nodeId: nextSkill.id, status: "ready" });
      return {
        kind: "foundation_unit",
        skillNodeId: nextSkill.id,
        changes,
        stageChanges,
      };
    }
    // Every skill in the ability is mastered — the skillset tier climb opens.
    // The stage change is the explicit record of that unlock; nothing may
    // infer it from the ability's lifecycle status.
    if (mastered.parentNodeId) {
      const ability = nodes.find((node) => node.id === mastered.parentNodeId);
      if (ability?.status === "completed") {
        return { kind: "none", changes, stageChanges };
      }
      stageChanges.push({ nodeId: mastered.parentNodeId, stage: "skillset" });
      return {
        kind: "skillset_unit",
        abilityNodeId: mastered.parentNodeId,
        changes,
        stageChanges,
      };
    }
    return { kind: "none", changes, stageChanges };
  }

  // Topic mode: outcomes are siblings under the root with no layer between
  // them and their units, so mastering one simply opens the next. An outcome
  // already `ready` (an interleaved plan unlocks them all at build time) needs
  // no status change — it just becomes the node the next unit is created under.
  if (mastered.kind === "outcome") {
    const nextOutcome = ordered.find(
      (node) =>
        node.kind === "outcome" &&
        node.parentNodeId === mastered.parentNodeId &&
        statusOf(node) !== "completed",
    );
    if (!nextOutcome) return { kind: "plan_complete", changes, stageChanges };
    if (nextOutcome.status === "planned") {
      changes.push({ nodeId: nextOutcome.id, status: "ready" });
    }
    return {
      kind: "outcome_unit",
      outcomeNodeId: nextOutcome.id,
      changes,
      stageChanges,
    };
  }

  if (mastered.kind === "ability") {
    stageChanges.push({ nodeId: masteredNodeId, stage: "mastered" });
    const nextAbility = ordered.find(
      (node) =>
        node.kind === "ability" &&
        node.parentNodeId === mastered.parentNodeId &&
        node.orderIndex > mastered.orderIndex,
    );
    if (!nextAbility) return { kind: "plan_complete", changes, stageChanges };
    if (statusOf(nextAbility) === "completed") {
      return { kind: "none", changes, stageChanges };
    }
    changes.push({ nodeId: nextAbility.id, status: "ready" });
    const firstSkill = ordered.find(
      (node) => node.kind === "skill" && node.parentNodeId === nextAbility.id,
    );
    if (firstSkill) {
      if (statusOf(firstSkill) === "completed") {
        return { kind: "none", changes, stageChanges };
      }
      stageChanges.push({ nodeId: nextAbility.id, stage: "foundations" });
      changes.push({ nodeId: firstSkill.id, status: "ready" });
      return {
        kind: "foundation_unit",
        skillNodeId: firstSkill.id,
        changes,
        stageChanges,
      };
    }
    return { kind: "none", changes, stageChanges };
  }

  return { kind: "none", changes, stageChanges };
};

/**
 * Roll a parent's status up from its children: `completed` when every child is,
 * `ready` when any child is ready-or-completed, otherwise `planned`. Returns
 * null when the parent has no children — there is nothing to roll up.
 */
export const rollUpParentStatus = (
  children: readonly { status: CurriculumNodeStatus }[],
): CurriculumNodeStatus | null => {
  if (children.length === 0) {
    return null;
  }
  if (children.every((child) => child.status === "completed")) {
    return "completed";
  }
  if (
    children.some(
      (child) => child.status === "ready" || child.status === "completed",
    )
  ) {
    return "ready";
  }
  return "planned";
};

/**
 * Compute the parent rollup for `parentNodeId` after `overrides` are applied to
 * its children. Returns null when there is no parent, no children, or the
 * recomputed status already matches what is stored (a no-op write).
 */
const parentRollup = (
  nodes: readonly ProgressionNode[],
  parentNodeId: string | null,
  overrides: Readonly<Record<string, CurriculumNodeStatus>>,
): StatusChange | null => {
  if (!parentNodeId) {
    return null;
  }
  const parent = nodes.find((node) => node.id === parentNodeId);
  const children = nodes.filter((node) => node.parentNodeId === parentNodeId);
  const status = rollUpParentStatus(
    children.map((child) => ({ status: overrides[child.id] ?? child.status })),
  );
  if (!status || parent?.status === status) {
    return null;
  }
  return { nodeId: parentNodeId, status };
};

/**
 * Status changes for marking `nodeId` completed: the node itself plus any
 * rollup its parent inherits.
 */
export const planCompletion = (
  nodes: readonly ProgressionNode[],
  nodeId: string,
): StatusChange[] => {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return [];
  }
  const changes: StatusChange[] = [{ nodeId, status: "completed" }];
  const rollup = parentRollup(nodes, node.parentNodeId, {
    [nodeId]: "completed",
  });
  if (rollup) {
    changes.push(rollup);
  }
  return changes;
};
