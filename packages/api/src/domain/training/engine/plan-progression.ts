import type {
  CurriculumNodeKind,
  CurriculumNodeStatus,
} from "../types/training.types";
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

export type MasteryProgressionDecision =
  | { intent: "create_unit" }
  | { intent: "node_complete" };

/** Skill Map breadth and rating depth for one outcome. */
export interface MasteryProgressionState {
  regime: "main_outcome";
  unpracticedSkillCount: number;
  skillCount: number;
  learnerRating: number;
  ratingDeviation: number;
  masteryRating: number;
  maxRatingDeviation?: number;
}

const ratingGatePasses = (state: MasteryProgressionState): boolean =>
  state.learnerRating >= state.masteryRating &&
  state.ratingDeviation <=
    (state.maxRatingDeviation ?? DEFAULT_MAX_RATING_DEVIATION);

export const WARM_NEXT_OUTCOME_COVERAGE = 0.8;

export const shouldWarmNextOutcome = (
  state: MasteryProgressionState,
): boolean => {
  if (state.skillCount === 0) return false;
  const covered = 1 - state.unpracticedSkillCount / state.skillCount;
  return covered >= WARM_NEXT_OUTCOME_COVERAGE || ratingGatePasses(state);
};

export const usesDynamicMasteryLoop = ({
  nodeKind,
  parentHasSkillMap,
}: {
  nodeKind: CurriculumNodeKind;
  parentHasSkillMap: boolean;
}): boolean => nodeKind === "unit" && parentHasSkillMap;

export const decideMasteryProgression = (
  state: MasteryProgressionState,
): MasteryProgressionDecision =>
  state.unpracticedSkillCount === 0 && ratingGatePasses(state)
    ? { intent: "node_complete" }
    : { intent: "create_unit" };

export type SkillMapAdvancement =
  | {
      kind: "outcome_unit";
      outcomeNodeId: string;
      changes: StatusChange[];
    }
  | {
      kind: "plan_complete";
      changes: StatusChange[];
    }
  | { kind: "none"; changes: StatusChange[] };

export const planSkillMapAdvancement = (
  nodes: readonly ProgressionNode[],
  masteredNodeId: string,
): SkillMapAdvancement => {
  const mastered = nodes.find((node) => node.id === masteredNodeId);
  if (mastered?.kind !== "outcome") {
    return { kind: "none", changes: [] };
  }

  const changes: StatusChange[] = [
    { nodeId: masteredNodeId, status: "completed" },
  ];
  const nextOutcome = [...nodes]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .find(
      (node) =>
        node.kind === "outcome" &&
        node.parentNodeId === mastered.parentNodeId &&
        node.status !== "completed" &&
        node.id !== masteredNodeId,
    );

  if (!nextOutcome) {
    return { kind: "plan_complete", changes };
  }
  if (nextOutcome.status === "planned") {
    changes.push({ nodeId: nextOutcome.id, status: "ready" });
  }
  return {
    kind: "outcome_unit",
    outcomeNodeId: nextOutcome.id,
    changes,
  };
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
