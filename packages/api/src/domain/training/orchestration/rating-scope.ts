import type {
  CurriculumNode,
  DifficultyBand,
  UnitContent,
} from "../types/training.types";

/**
 * Which node a Goldilocks rating belongs to.
 *
 * A learner's skill is the `skill_cluster` node, not the individual education
 * `unit` leaves beneath it. Every rating read and write resolves the unit it is
 * working on up to that cluster, so one cumulative rating accrues across all of
 * a skill's units instead of a fresh, evidence-starved rating per unit.
 *
 * The bands travel with the rating: they are read from the same cluster node so
 * the difficulty ladder stays stable across the cluster's units. If the cluster
 * has no bands the unit's own bands are used, and the rating engine falls back
 * to defaults when both are absent.
 */
export interface RatingScope {
  /** Node the rating state is keyed on (the skill cluster, when one exists). */
  nodeId: string;
  /** Difficulty ladder for that node, or null to let the engine default it. */
  bands: readonly DifficultyBand[] | null;
}

/**
 * Walk a unit up to its nearest `skill_cluster` ancestor and return that node as
 * the rating scope. Falls back to the unit's own node when no cluster ancestor
 * exists (a root-level unit, integration, or simulation), which preserves the
 * pre-cluster behaviour rather than dropping the rating on the floor.
 *
 * Pure and side-effect free: it reads only the plan nodes already in memory, so
 * it adds no round-trips and is safe to call on every rating touch.
 */
export const resolveRatingScope = ({
  unit,
  planNodes,
}: {
  unit: Pick<UnitContent, "nodeId" | "difficultyBands">;
  planNodes: readonly CurriculumNode[];
}): RatingScope => {
  const nodesById = new Map(planNodes.map((node) => [node.id, node]));
  const unitNode = nodesById.get(unit.nodeId) ?? null;

  let cursor: CurriculumNode | null = unitNode?.parentNodeId
    ? (nodesById.get(unitNode.parentNodeId) ?? null)
    : null;
  const seen = new Set<string>();

  while (cursor && cursor.kind !== "skill_cluster") {
    if (seen.has(cursor.id)) {
      cursor = null;
      break;
    }
    seen.add(cursor.id);
    cursor = cursor.parentNodeId
      ? (nodesById.get(cursor.parentNodeId) ?? null)
      : null;
  }

  if (cursor?.kind === "skill_cluster") {
    return {
      nodeId: cursor.id,
      bands: cursor.difficultyBands ?? unit.difficultyBands ?? null,
    };
  }

  return { nodeId: unit.nodeId, bands: unit.difficultyBands ?? null };
};
