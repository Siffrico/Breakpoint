import { Duration, Effect, Schedule } from "effect";

import type { Result } from "../../../lib/result";
import type { PersistedUnitRun } from "../education-unit/unit-state";
import type { MasteryProgressionState } from "../engine/plan-progression";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import type { CreateNextUnitError } from "../unit-creation/create-next-unit";
import { DbError } from "../../../effect/errors";
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
  markNodeReady: (nodeId: string) => Promise<unknown>;
  touchSession: (sessionId: string) => Promise<unknown>;
}

interface AdvanceCompletedUnitDependencies {
  withTransaction: <A>(
    run: (deps: AdvanceCompletedUnitTransactionDependencies) => Promise<A>,
  ) => Promise<A>;
  createUnit: (input: {
    skillNodeId: string;
    sessionId: string;
    userId: string;
    excludeUnitNodeId?: string;
  }) => Effect.Effect<unknown, CreateNextUnitError>;
  /** Resolves null when the parent has no skill map (legacy/imported plans). */
  getProgressionState: (input: {
    skillNodeId: string;
    userId: string;
    /** The mastered unit being advanced, before its node status is committed. */
    includeUnitNodeId?: string;
  }) => Promise<MasteryProgressionState | null>;
  getMissionStatus: (input: {
    sessionId: string;
    unitContentId: string;
    userId: string;
  }) => Promise<{
    unitRunId: string;
    status: "completed" | "active" | "drafting" | null;
  } | null>;
  /** Complete a mastered outcome, unlock the next one, and create its unit. */
  advanceSkillMapNode: (input: {
    skillNodeId: string;
    sessionId: string;
    userId: string;
  }) => Effect.Effect<unknown, DbError | CreateNextUnitError>;
  runProgressionEffect: (
    effect: Effect.Effect<void, DbError | CreateNextUnitError>,
  ) => Promise<void>;
  /**
   * Keeps the serverless function alive until the task settles (Next.js
   * `after`). Without it the runtime freezes the instance once the response
   * is sent, killing the unit creation mid-generation.
   */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}

const isTransientUnitCreationFailure = (
  error: DbError | CreateNextUnitError,
): boolean =>
  error._tag === "DbError" ||
  error._tag === "UnitPersistError" ||
  (error._tag === "UnitScaffoldError" &&
    (error.kind === "provider" || error.kind === "timeout"));

const failureMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;

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
  Result<
    | { advanced: true; nextReadyNode: CurriculumNode | null }
    | { advanced: false; progressionPending: true }
    | {
        advanced: false;
        missionRequired: true;
        unitRunId: string;
      }
  >
> => {
  let completed: {
    node: CurriculumNode;
    parent: CurriculumNode | null;
    run: PersistedUnitRun;
  };
  try {
    completed = await deps.withTransaction(async (tx) => {
      const plan = await tx.getActivePlan(sessionId);
      const node = plan?.nodes.find((item) => item.id === nodeId) ?? null;
      const unit = node ? await tx.getUnitByNodeId(node.id) : null;
      const run = unit ? await tx.getUnitRun(sessionId, unit.id) : null;

      assertUnitCanAdvance({ node, run });

      if (!node || !run) throw new Error("Completed unit context is missing.");
      return {
        node,
        parent:
          plan?.nodes.find((item) => item.id === node.parentNodeId) ?? null,
        run,
      };
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : "Unit cannot advance.");
  }

  let progression:
    | {
        skillNodeId: string;
        userId: string;
        decision: ReturnType<typeof decideMasteryProgression>;
      }
    | undefined;
  if (
    completed.node.kind === "unit" &&
    completed.node.parentNodeId &&
    completed.run.userId
  ) {
    const skillNodeId = completed.node.parentNodeId;
    const userId = completed.run.userId;
    let state: MasteryProgressionState | null;
    try {
      state = await deps.getProgressionState({
        skillNodeId,
        userId,
        includeUnitNodeId: completed.node.id,
      });
    } catch (error) {
      return err(
        failureMessage(error, "Progression state could not be loaded."),
      );
    }
    if (state) {
      const decision = decideMasteryProgression(state);
      if (
        decision.intent === "node_complete" &&
        completed.parent?.kind === "outcome"
      ) {
        const mission = await deps.getMissionStatus({
          sessionId,
          unitContentId: completed.run.unitId,
          userId,
        });
        if (mission?.status !== "completed") {
          if (!mission) {
            return err("Mission context is unavailable.");
          }
          return ok({
            advanced: false,
            missionRequired: true,
            unitRunId: mission.unitRunId,
          });
        }
      }
      progression = { skillNodeId, userId, decision };
    }
  }

  let promoted: { node: CurriculumNode; hadContent: boolean } | null = null;
  let completeAfterBackground = false;
  try {
    const transition = await deps.withTransaction(async (tx) => {
      const plan = await tx.getActivePlan(sessionId);
      const node = plan?.nodes.find((item) => item.id === nodeId) ?? null;
      const unit = node ? await tx.getUnitByNodeId(node.id) : null;
      const run = unit ? await tx.getUnitRun(sessionId, unit.id) : null;
      assertUnitCanAdvance({ node, run });
      if (!node) throw new Error("Completed unit context is missing.");
      const plannedSibling =
        progression?.decision.intent === "create_unit"
          ? (plan?.nodes.find(
              (candidate) =>
                candidate.kind === "unit" &&
                candidate.parentNodeId === node.parentNodeId &&
                candidate.orderIndex > node.orderIndex &&
                candidate.status === "planned",
            ) ?? null)
          : null;
      // Promote even when pre-generation hasn't landed content yet: a planned
      // node left behind would be invisible to the ready-scoped fallback,
      // which would then append a duplicate. Promoting it lets the fallback
      // adopt it as the open ready unit and prepare its content.
      if (plannedSibling) await tx.markNodeReady(plannedSibling.id);
      const plannedContent = plannedSibling
        ? await tx.getUnitByNodeId(plannedSibling.id)
        : null;
      const shouldCompleteAfterBackground =
        progression != null &&
        (progression.decision.intent === "node_complete" || !plannedSibling);
      if (!shouldCompleteAfterBackground && node.status !== "completed") {
        await tx.completeNode(nodeId);
      }
      await tx.touchSession(sessionId);
      return {
        completeAfterBackground: shouldCompleteAfterBackground,
        promoted: plannedSibling
          ? {
              node: { ...plannedSibling, status: "ready" as const },
              hadContent: plannedContent != null,
            }
          : null,
      };
    });
    promoted = transition.promoted;
    completeAfterBackground = transition.completeAfterBackground;
  } catch (error) {
    return err(error instanceof Error ? error.message : "Unit cannot advance.");
  }
  const nextReadyNode = promoted?.node ?? null;

  if (progression) {
    const { skillNodeId, userId, decision } = progression;
    const promotedHadContent = promoted?.hadContent ?? false;
    const completeCurrentUnit = Effect.tryPromise({
      try: () =>
        deps.withTransaction(async (tx) => {
          const plan = await tx.getActivePlan(sessionId);
          const node =
            plan?.nodes.find((candidate) => candidate.id === nodeId) ?? null;
          if (!node) throw new Error("Completed unit context is missing.");
          if (node.status !== "completed") await tx.completeNode(nodeId);
          await tx.touchSession(sessionId);
        }),
      catch: (cause) =>
        new DbError({
          operation: "completeAdvancedUnit",
          kind: "unknown",
          message: "The completed unit could not be finalized.",
          cause,
        }),
    });
    const createNextUnitTask = Effect.gen(function* () {
      if (decision.intent === "create_unit") {
        // Fully prepared by pre-generation — nothing left to create. A
        // promoted-but-contentless node still needs createUnit, which finds
        // it as the open ready unit and generates its content.
        if (promotedHadContent) return;
        yield* deps.createUnit({
          skillNodeId,
          sessionId,
          userId,
          excludeUnitNodeId: promoted ? undefined : nodeId,
        });
      } else {
        // The outcome is mastered — advance to the next outcome.
        yield* deps.advanceSkillMapNode({ skillNodeId, sessionId, userId });
      }
      if (completeAfterBackground) yield* completeCurrentUnit;
    }).pipe(
      Effect.retry({
        schedule: Schedule.exponential(Duration.seconds(2)).pipe(
          Schedule.jittered,
        ),
        times: 3,
        while: isTransientUnitCreationFailure,
      }),
      Effect.tapCause((cause) =>
        Effect.logError("unit progression failed permanently", {
          skillNodeId,
          cause,
        }),
      ),
    );

    const runUnitCreation = () => deps.runProgressionEffect(createNextUnitTask);
    if (deps.scheduleBackgroundTask) {
      try {
        deps.scheduleBackgroundTask(runUnitCreation);
      } catch (error) {
        return err(
          failureMessage(error, "Unit progression could not be scheduled."),
        );
      }
    } else {
      try {
        await runUnitCreation();
      } catch (error) {
        return err(failureMessage(error, "Unit progression failed."));
      }
    }
  }

  return completeAfterBackground
    ? ok({ advanced: false, progressionPending: true })
    : ok({ advanced: true, nextReadyNode });
};
