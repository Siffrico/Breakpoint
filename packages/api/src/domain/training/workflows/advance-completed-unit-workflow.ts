import { Duration, Effect, Schedule } from "effect";

import type { DbError } from "../../../effect/errors";
import type { Result } from "../../../lib/result";
import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import type { CreateNextUnitError } from "../unit-creation/create-next-unit";
import type { MasteryProgressionState } from "../engine/plan-progression";
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
  completeNode: (nodeId: string) => Promise<unknown>;
  touchSession: (sessionId: string) => Promise<unknown>;
}

interface AdvanceCompletedUnitDependencies {
  withTransaction: <A>(
    run: (deps: AdvanceCompletedUnitTransactionDependencies) => Promise<A>,
  ) => Promise<A>;
  createUnit: (input: {
    clusterNodeId: string;
    sessionId: string;
    userId: string;
  }) => Effect.Effect<unknown, CreateNextUnitError>;
  /** Resolves null when the parent has no skill map (legacy/imported plans). */
  getProgressionState: (input: {
    clusterNodeId: string;
    userId: string;
  }) => Effect.Effect<MasteryProgressionState | null, DbError>;
  /**
   * The parent skill/ability is mastered: complete it, unlock what follows
   * (next skill's foundation unit, the ability's skillset units, or the next
   * ability), and create the unlocked unit.
   */
  advanceSkillMapNode: (input: {
    clusterNodeId: string;
    sessionId: string;
    userId: string;
  }) => Effect.Effect<unknown, DbError>;
  /**
   * Keeps the serverless function alive until the task settles (Next.js
   * `after`). Without it the runtime freezes the instance once the response
   * is sent, killing the unit creation mid-generation.
   */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}

const isTransientUnitCreationFailure = (error: DbError | CreateNextUnitError): boolean =>
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
    const createNextUnitTask = Effect.gen(function* () {
      const userId = completed.run.userId;
      if (!userId) {
        yield* Effect.logError("Unit run has no learner id.", {
          clusterNodeId,
        });
        return;
      }
      const state = yield* deps.getProgressionState({
        clusterNodeId,
        userId,
      });
      // Legacy plans have no skill map; completeNode already ran list
      // advancement for them, so there is nothing to create here.
      if (!state) return;
      const decision = decideMasteryProgression(state);
      if (decision.intent === "create_unit") {
        yield* deps.createUnit({
          clusterNodeId,
          sessionId,
          userId,
        });
      } else {
        // The parent skill/ability is mastered — advance the hierarchy.
        yield* deps.advanceSkillMapNode({ clusterNodeId, sessionId, userId });
      }
    }).pipe(
      Effect.retry({
        schedule: Schedule.exponential(Duration.seconds(2)).pipe(
          Schedule.jittered,
        ),
        times: 3,
        while: isTransientUnitCreationFailure,
      }),
      Effect.tapCause((cause) =>
        Effect.logError("unit creation failed permanently", {
          clusterNodeId,
          cause,
        }),
      ),
    );

    // Failures are already logged via tapCause; ignore them here so the
    // background runner never rejects.
    const runUnitCreation = () => Effect.runPromise(Effect.ignore(createNextUnitTask));
    if (deps.scheduleBackgroundTask) {
      deps.scheduleBackgroundTask(runUnitCreation);
    } else {
      void runUnitCreation();
    }
  }

  return ok({ advanced: true, nextReadyNode: null });
};
