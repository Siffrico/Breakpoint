import type {
  CurriculumNode,
  DifficultyBand,
  UnitContent,
} from "../types/training.types";

/**
 * Which node a Goldilocks rating belongs to.
 *
 * A learner's outcome owns the rating, not the individual education-unit
 * leaves beneath it. Every rating read and write resolves a unit up to that
 * outcome, so one cumulative rating accrues across integrated practice.
 *
 * The bands travel with the rating: they are read from the same outcome so
 * the difficulty ladder stays stable across the cluster's units. If the cluster
 * has no bands the unit's own bands are used, and the rating engine falls back
 * to defaults when both are absent.
 */
export interface RatingScope {
  /** Node the rating state is keyed on (the outcome). */
  nodeId: string;
  /** Difficulty ladder for that node, or null to let the engine default it. */
  bands: readonly DifficultyBand[] | null;
}

export class CurriculumInvariantError extends Error {
  readonly code = "CURRICULUM_INVARIANT_VIOLATION";

  constructor(message: string) {
    super(message);
    this.name = "CurriculumInvariantError";
  }
}

const RATING_SCOPE_KINDS = new Set<CurriculumNode["kind"]>(["outcome"]);

/**
 * Walk a unit up to its outcome ancestor and return that node as the rating
 * scope. One cumulative rating accrues per outcome.
 * The active curriculum graph is a required invariant: rating against a
 * guessed fallback node would silently split one ability's history into
 * multiple buckets.
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
  const unitNode = nodesById.get(unit.nodeId);
  if (!unitNode) {
    throw new CurriculumInvariantError(
      `Unit node ${unit.nodeId} is missing from the active curriculum plan.`,
    );
  }

  let cursor: CurriculumNode = unitNode;
  const seen = new Set<string>([unitNode.id]);

  while (!RATING_SCOPE_KINDS.has(cursor.kind)) {
    if (!cursor.parentNodeId) {
      throw new CurriculumInvariantError(
        `Node ${cursor.id} has no outcome ancestor.`,
      );
    }

    const parent = nodesById.get(cursor.parentNodeId);
    if (!parent) {
      throw new CurriculumInvariantError(
        `Node ${cursor.id} references missing parent ${cursor.parentNodeId}.`,
      );
    }
    if (seen.has(parent.id)) {
      throw new CurriculumInvariantError(
        `Curriculum cycle detected at node ${parent.id}.`,
      );
    }

    seen.add(parent.id);
    cursor = parent;
  }

  return {
    nodeId: cursor.id,
    bands: cursor.difficultyBands ?? unit.difficultyBands ?? null,
  };
};
