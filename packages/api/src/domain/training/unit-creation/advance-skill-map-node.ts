import { Effect } from "effect";

import type { DbError } from "../../../effect/errors";
import type {
  ProgressionNode,
  SkillMapAdvancement,
  StageChange,
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
   * Persist the advancement's status AND stage sets in ONE transaction.
   * Atomicity is the contract: a partial write could complete the mastered
   * node while its successor stays locked, leaving the plan with no
   * recoverable ready frontier.
   */
  applyAdvancement: (advancement: {
    changes: readonly StatusChange[];
    stageChanges: readonly StageChange[];
  }) => Effect.Effect<void, DbError>;
  /** Idempotently ensure the named parent's next unit (open or created). */
  createNextUnit: (
    parentNodeId: string,
  ) => Effect.Effect<unknown, CreateNextUnitError>;
}

/**
 * A skillMap node (skill or ability) is mastered: apply the pure advancement
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
    const nextParentId =
      advancement.kind === "foundation_unit"
        ? advancement.skillNodeId
        : advancement.kind === "skillset_unit"
          ? advancement.abilityNodeId
          : null;
    if (nextParentId) yield* deps.createNextUnit(nextParentId);
    return advancement;
  });
