import { Effect } from "effect";

import type { DbError } from "../../../effect/errors";
import type {
  ProgressionNode,
  SkillMapAdvancement,
  StatusChange,
} from "../engine/plan-progression";
import type { CreateNextUnitError } from "./create-next-unit";
import { planSkillMapAdvancement } from "../engine/plan-progression";

export interface AdvanceSkillMapNodeDependencies {
  /** Every node in the mastered node's plan, or null when the node is gone. */
  loadPlanNodes: (
    nodeId: string,
  ) => Effect.Effect<ProgressionNode[] | null, DbError>;
  /**
   * Persist the advancement's status changes in one transaction.
   * Atomicity is the contract: a partial write could complete the mastered
   * node while its successor stays locked, leaving the plan with no
   * recoverable ready frontier.
   */
  applyAdvancement: (advancement: {
    changes: readonly StatusChange[];
  }) => Effect.Effect<void, DbError>;
  /** Idempotently ensure the named parent's next unit (open or created). */
  createNextUnit: (
    parentNodeId: string,
  ) => Effect.Effect<unknown, CreateNextUnitError>;
}

/**
 * The node the advancement's next unit hangs off, or null when the advancement
 * names none (plan complete, or nothing to do).
 */
const nextUnitParentOf = (advancement: SkillMapAdvancement): string | null => {
  switch (advancement.kind) {
    case "outcome_unit":
      return advancement.outcomeNodeId;
    case "plan_complete":
    case "none":
      return null;
  }
};

/**
 * An outcome is mastered: apply the pure advancement
 * plan (complete it, unlock what follows) atomically, then ensure the next
 * unit it names. Idempotent per node — re-running on an already-completed
 * node re-applies the same statuses and re-ensures the same next unit, so a
 * failure after the status commit is recoverable by simply running again.
 */
export const advanceSkillMapNodeWorkflow = ({
  nodeId,
  deps,
}: {
  nodeId: string;
  deps: AdvanceSkillMapNodeDependencies;
}): Effect.Effect<SkillMapAdvancement | null, DbError | CreateNextUnitError> =>
  Effect.gen(function* () {
    const nodes = yield* deps.loadPlanNodes(nodeId);
    if (!nodes) return null;
    const advancement = planSkillMapAdvancement(nodes, nodeId);
    yield* deps.applyAdvancement(advancement);
    const nextParentId = nextUnitParentOf(advancement);
    if (nextParentId) yield* deps.createNextUnit(nextParentId);
    return advancement;
  });
