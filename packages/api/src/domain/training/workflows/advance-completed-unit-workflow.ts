import type { Result } from "../../../lib/result";
import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import { err, ok } from "../../../lib/result";
import { decideMasteryProgression } from "../engine/plan-progression";
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
  mintUnit: (input: {
    clusterNodeId: string;
    sessionId: string;
    userId: string;
  }) => Promise<unknown>;
  getMasteryState: (input: {
    clusterNodeId: string;
    userId: string;
  }) => Promise<{
    uncheckedEntryCount: number;
    learnerRating: number;
    ratingDeviation: number;
    peakRating: number;
    simulationPassed: boolean;
    maxRatingDeviation?: number;
  }>;
  openSimulation: (clusterNodeId: string) => Promise<unknown>;
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
  let completed: { node: CurriculumNode; run: PersistedUnitRun };
  try {
    completed = await deps.withTransaction(async (tx) => {
      const plan = await tx.getActivePlan(sessionId);
      const node = plan?.nodes.find((item) => item.id === nodeId) ?? null;
      const unit = node ? await tx.getUnitByNodeId(node.id) : null;
      const run = unit ? await tx.getUnitRun(sessionId, unit.id) : null;

      assertUnitCanAdvance({ node, run });

      if (!node || !run) throw new Error("Completed unit context is missing.");
      if (node.status !== "completed") await tx.completeNode(nodeId);
      await tx.touchSession(sessionId);
      return { node, run };
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : "Unit cannot advance.");
  }

  if (completed.node.kind === "unit" && completed.node.parentNodeId) {
    const clusterNodeId = completed.node.parentNodeId;
    const mint = async () => {
      try {
        const userId = completed.run.userId;
        if (!userId) throw new Error("Unit run has no learner id.");
        const state = await deps.getMasteryState({
          clusterNodeId,
          userId,
        });
        const decision = decideMasteryProgression(state);
        if (decision.intent === "mint") {
          await deps.mintUnit({
            clusterNodeId,
            sessionId,
            userId,
          });
        } else if (decision.intent === "simulation") {
          await deps.openSimulation(clusterNodeId);
        }
      } catch (error) {
        console.error("Next unit mint failed", {
          clusterNodeId: completed.node.parentNodeId,
          error,
        });
      }
    };

    if (deps.scheduleBackgroundTask) {
      deps.scheduleBackgroundTask(mint);
    } else {
      void mint();
    }
  }

  return ok({ advanced: true, nextReadyNode: null });
};
