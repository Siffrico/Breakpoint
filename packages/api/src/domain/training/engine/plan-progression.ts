import type {
  CurriculumNodeKind,
  CurriculumNodeStatus,
} from "../types/training.types";

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

export interface AdvanceResult {
  /** The node newly unlocked to `ready`, or null when nothing advanced. */
  advancedNodeId: string | null;
  changes: StatusChange[];
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
 *   - "skillset" (parent is an `ability`, or a legacy `skill_cluster`): the
 *     ELO tier climb. Mastered at peak rating with a tight deviation. The
 *     optional uncheckedEntryCount keeps legacy clusters honest about their
 *     syllabus frontier; v2 abilities pass 0.
 */
export type MasteryProgressionState =
  | {
      regime: "foundation";
      entries: readonly { coverageCount: number }[];
      coverageTarget: number;
    }
  | {
      regime: "skillset";
      uncheckedEntryCount: number;
      learnerRating: number;
      ratingDeviation: number;
      peakRating: number;
      maxRatingDeviation?: number;
    };

/**
 * Whether a completed node's progression is owned by the dynamic mastery loop
 * (create_unit/node_complete decisions) instead of list advancement. Only
 * nodes whose parent has a skill map qualify — legacy and imported plans have
 * no skill map, so their units keep advancing via {@link planAdvancement}.
 */
export const usesDynamicMasteryLoop = ({
  nodeKind,
  parentHasSkillMap,
}: {
  nodeKind: CurriculumNodeKind;
  parentHasSkillMap: boolean;
}): boolean =>
  (nodeKind === "simulation" || nodeKind === "unit") && parentHasSkillMap;

export const decideMasteryProgression = (
  state: MasteryProgressionState,
): MasteryProgressionDecision => {
  if (state.regime === "foundation") {
    const mastered =
      state.entries.length > 0 &&
      state.entries.every(
        (entry) => entry.coverageCount >= state.coverageTarget,
      );
    return mastered ? { intent: "node_complete" } : { intent: "create_unit" };
  }
  const { maxRatingDeviation = 80 } = state;
  if (
    state.uncheckedEntryCount === 0 &&
    state.learnerRating >= state.peakRating &&
    state.ratingDeviation <= maxRatingDeviation
  ) {
    return { intent: "node_complete" };
  }
  return { intent: "create_unit" };
};

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
  | { kind: "foundation_unit"; skillNodeId: string; changes: StatusChange[] }
  | { kind: "skillset_unit"; abilityNodeId: string; changes: StatusChange[] }
  | { kind: "plan_complete"; changes: StatusChange[] }
  | { kind: "none"; changes: StatusChange[] };

export const planSkillMapAdvancement = (
  nodes: readonly ProgressionNode[],
  masteredNodeId: string,
): SkillMapAdvancement => {
  const mastered = nodes.find((node) => node.id === masteredNodeId);
  if (!mastered) return { kind: "none", changes: [] };

  const changes: StatusChange[] = [
    { nodeId: masteredNodeId, status: "completed" },
  ];
  const ordered = [...nodes].sort((a, b) => a.orderIndex - b.orderIndex);
  const statusOf = (node: ProgressionNode): CurriculumNodeStatus =>
    node.id === masteredNodeId ? "completed" : node.status;

  if (mastered.kind === "skill") {
    const siblingSkills = ordered.filter(
      (node) =>
        node.kind === "skill" && node.parentNodeId === mastered.parentNodeId,
    );
    const nextSkill = siblingSkills.find(
      (node) => statusOf(node) !== "completed",
    );
    if (nextSkill) {
      changes.push({ nodeId: nextSkill.id, status: "ready" });
      return { kind: "foundation_unit", skillNodeId: nextSkill.id, changes };
    }
    // Every skill in the ability is mastered — the skillset tier climb opens.
    if (mastered.parentNodeId) {
      return {
        kind: "skillset_unit",
        abilityNodeId: mastered.parentNodeId,
        changes,
      };
    }
    return { kind: "none", changes };
  }

  if (mastered.kind === "ability" || mastered.kind === "skill_cluster") {
    const nextAbility = ordered.find(
      (node) =>
        (node.kind === "ability" || node.kind === "skill_cluster") &&
        statusOf(node) !== "completed",
    );
    if (!nextAbility) return { kind: "plan_complete", changes };
    changes.push({ nodeId: nextAbility.id, status: "ready" });
    const firstSkill = ordered.find(
      (node) => node.kind === "skill" && node.parentNodeId === nextAbility.id,
    );
    if (firstSkill) {
      changes.push({ nodeId: firstSkill.id, status: "ready" });
      return { kind: "foundation_unit", skillNodeId: firstSkill.id, changes };
    }
    // Legacy cluster with no skill children: its units are created directly
    // under it by the mastery loop; nothing further to name here.
    return { kind: "none", changes };
  }

  return { kind: "none", changes };
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

/**
 * Decide which node unlocks after `completedNodeId` is completed, in priority
 * order:
 *   1. finishing every unit in a cluster unlocks that cluster's simulation;
 *   2. otherwise the next still-planned unit (by order) unlocks;
 *   3. once every unit is complete, the next integration layer unlocks.
 *
 * The just-completed node is treated as completed regardless of the snapshot it
 * is read in, so the result does not depend on read-after-write ordering.
 */
export const planAdvancement = (
  nodes: readonly ProgressionNode[],
  completedNodeId: string,
): AdvanceResult => {
  const completed = nodes.find((node) => node.id === completedNodeId);
  if (!completed) {
    return { advancedNodeId: null, changes: [] };
  }

  const ordered = [...nodes].sort((a, b) => a.orderIndex - b.orderIndex);
  const statusOf = (node: ProgressionNode): CurriculumNodeStatus =>
    node.id === completedNodeId ? "completed" : node.status;

  const unlock = (
    nodeId: string,
    parentNodeId: string | null,
  ): AdvanceResult => {
    const changes: StatusChange[] = [{ nodeId, status: "ready" }];
    const rollup = parentRollup(nodes, parentNodeId, {
      [completedNodeId]: "completed",
      [nodeId]: "ready",
    });
    if (rollup) {
      changes.push(rollup);
    }
    return { advancedNodeId: nodeId, changes };
  };

  if (completed.kind === "unit" && completed.parentNodeId) {
    const siblingUnits = ordered.filter(
      (node) =>
        node.parentNodeId === completed.parentNodeId && node.kind === "unit",
    );
    const clusterFinished =
      siblingUnits.length > 0 &&
      siblingUnits.every((node) => statusOf(node) === "completed");

    if (clusterFinished) {
      const simulation = ordered.find(
        (node) =>
          node.parentNodeId === completed.parentNodeId &&
          node.kind === "simulation" &&
          statusOf(node) === "planned",
      );
      if (simulation) {
        return unlock(simulation.id, simulation.parentNodeId);
      }
    }
  }

  const nextPlannedUnit = ordered.find(
    (node) => node.kind === "unit" && statusOf(node) === "planned",
  );
  if (nextPlannedUnit) {
    return unlock(nextPlannedUnit.id, nextPlannedUnit.parentNodeId);
  }

  const units = ordered.filter((node) => node.kind === "unit");
  const allUnitsComplete =
    units.length > 0 && units.every((node) => statusOf(node) === "completed");
  if (!allUnitsComplete) {
    return { advancedNodeId: null, changes: [] };
  }

  const nextIntegration = ordered.find(
    (node) => node.kind === "integration" && statusOf(node) === "planned",
  );
  if (nextIntegration) {
    return unlock(nextIntegration.id, nextIntegration.parentNodeId);
  }

  return { advancedNodeId: null, changes: [] };
};
