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
  | { intent: "mint" }
  | { intent: "simulation" }
  | { intent: "cluster_complete" };

export const decideMasteryProgression = ({
  uncheckedEntryCount,
  learnerRating,
  ratingDeviation,
  peakRating,
  simulationPassed,
}: {
  uncheckedEntryCount: number;
  learnerRating: number;
  ratingDeviation: number;
  peakRating: number;
  simulationPassed: boolean;
}): MasteryProgressionDecision => {
  if (simulationPassed) return { intent: "cluster_complete" };
  if (
    uncheckedEntryCount === 0 &&
    learnerRating >= peakRating &&
    ratingDeviation <= 80
  ) {
    return { intent: "simulation" };
  }
  return { intent: "mint" };
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
