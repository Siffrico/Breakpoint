import type { Result } from "../../../lib/result";
import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import { err, ok } from "../../../lib/result";
import { assertUnitCanAdvance } from "../workspace-ai/workspace-turn";

interface AdvanceCompletedUnitTransactionDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Promise<PersistedUnitRun | null>;
  completeNode: (nodeId: string) => Promise<CurriculumNode | null>;
  touchSession: (sessionId: string) => Promise<unknown>;
}

interface AdvanceCompletedUnitDependencies {
  withTransaction: <A>(
    run: (deps: AdvanceCompletedUnitTransactionDependencies) => Promise<A>,
  ) => Promise<A>;
  prewarmUnit: (input: {
    node: CurriculumNode;
    sessionId: string;
  }) => Promise<unknown>;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}

/**
 * Takes a mastered unit, produces the node made ready by its atomic curriculum
 * advance, and fails only when the unit cannot advance or persistence fails.
 */
export const advanceCompletedUnitWorkflow = async ({
  sessionId,
  nodeId,
  deps,
}: {
  sessionId: string;
  nodeId: string;
  deps: AdvanceCompletedUnitDependencies;
}): Promise<
  Result<{ advanced: true; nextReadyNode: CurriculumNode | null }>
> => {
  let nextReadyNode: CurriculumNode | null;
  try {
    nextReadyNode = await deps.withTransaction(async (tx) => {
      const plan = await tx.getActivePlan(sessionId);
      const node = plan?.nodes.find((item) => item.id === nodeId) ?? null;
      const unit = node ? await tx.getUnitByNodeId(node.id) : null;
      const run = unit ? await tx.getUnitRun(sessionId, unit.id) : null;

      assertUnitCanAdvance({ node, run });

      const advancedNode =
        node?.status === "completed" ? null : await tx.completeNode(nodeId);
      await tx.touchSession(sessionId);
      return advancedNode;
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : "Unit cannot advance.");
  }

  if (nextReadyNode) {
    const prewarm = async () => {
      try {
        await deps.prewarmUnit({ node: nextReadyNode, sessionId });
      } catch (error) {
        console.error("Advanced unit prewarm failed", {
          nodeId: nextReadyNode.id,
          error,
        });
      }
    };

    if (deps.scheduleBackgroundTask) {
      deps.scheduleBackgroundTask(prewarm);
    } else {
      void prewarm();
    }
  }

  return ok({ advanced: true, nextReadyNode });
};
