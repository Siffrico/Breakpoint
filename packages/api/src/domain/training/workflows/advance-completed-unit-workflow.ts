import { Duration, Effect, Schedule } from "effect";

import type { DbError } from "../../../effect/errors";
import type { Result } from "../../../lib/result";
import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import type { MintNextUnitError } from "../unit-minting/mint-next-unit";
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
  }) => Effect.Effect<unknown, MintNextUnitError>;
  /** Resolves null when the cluster has no skill map (legacy/imported plans). */
  getMasteryState: (input: {
    clusterNodeId: string;
    userId: string;
  }) => Effect.Effect<
    {
      uncheckedEntryCount: number;
      learnerRating: number;
      ratingDeviation: number;
      peakRating: number;
      simulationPassed: boolean;
      maxRatingDeviation?: number;
    } | null,
    DbError
  >;
  openSimulation: (clusterNodeId: string) => Effect.Effect<unknown, DbError>;
  /**
   * Keeps the serverless function alive until the task settles (Next.js
   * `after`). Without it the runtime freezes the instance once the response
   * is sent, killing the mint mid-generation.
   */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}

const isTransientMintFailure = (error: DbError | MintNextUnitError): boolean =>
  error._tag === "DbError" ||
  error._tag === "UnitPersistError" ||
  (error._tag === "UnitScaffoldError" &&
    (error.kind === "provider" || error.kind === "timeout"));

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
    const mint = Effect.gen(function* () {
      const userId = completed.run.userId;
      if (!userId) {
        yield* Effect.logError("Unit run has no learner id.", {
          clusterNodeId,
        });
        return;
      }
      const state = yield* deps.getMasteryState({
        clusterNodeId,
        userId,
      });
      // Legacy plans have no skill map; completeNode already ran list
      // advancement for them, so there is nothing to mint here.
      if (!state) return;
      const decision = decideMasteryProgression(state);
      if (decision.intent === "mint") {
        yield* deps.mintUnit({
          clusterNodeId,
          sessionId,
          userId,
        });
      } else if (decision.intent === "simulation") {
        yield* deps.openSimulation(clusterNodeId);
      }
    }).pipe(
      Effect.retry({
        schedule: Schedule.exponential(Duration.seconds(2)).pipe(
          Schedule.jittered,
        ),
        times: 3,
        while: isTransientMintFailure,
      }),
      Effect.tapCause((cause) =>
        Effect.logError("mint failed permanently", {
          clusterNodeId,
          cause,
        }),
      ),
    );

    // Failures are already logged via tapCause; ignore them here so the
    // background runner never rejects.
    const runMint = () => Effect.runPromise(Effect.ignore(mint));
    if (deps.scheduleBackgroundTask) {
      deps.scheduleBackgroundTask(runMint);
    } else {
      void runMint();
    }
  }

  return ok({ advanced: true, nextReadyNode: null });
};
