import type { Effect as EffectType } from "effect";
import { Cause, Effect, Exit } from "effect";

import type { DbError } from "../../../effect/errors";
import type { Result } from "../../../lib/result";
import type { CurriculumPlan } from "../types/training.types";
import type {
  EvaluationPlan,
  WorkspaceAiMessage,
  WorkspaceAiState,
} from "../workspace-ai/types";
import type {
  AiWorkspaceReaderSource,
  WorkspaceProjectionReaderSource,
} from "../workspace-ai/workspace-reader";
import { err, ok } from "../../../lib/result";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { getEvaluationProgress } from "../workspace-ai/evaluation-plan";
import { planWorkspaceTurn } from "../workspace-ai/orchestrator";
import { CurriculumNotReadyError } from "../workspace-ai/workspace-errors";
import {
  AiWorkspaceReader,
  makeAiWorkspaceReader,
  makeWorkspaceProjectionReader,
  WorkspaceProjectionReader,
} from "../workspace-ai/workspace-reader";
import {
  getUnitAdvanceGate,
  loadNextReadyUnitProjection,
  loadPlannedRecall,
  resolveRecallRunProjection,
} from "../workspace-ai/workspace-turn";

interface GetAiWorkspaceDependencies
  extends WorkspaceProjectionReaderSource,
    AiWorkspaceReaderSource {}

export interface AiWorkspaceView {
  plan: CurriculumPlan;
  state: WorkspaceAiState | null;
  messages: WorkspaceAiMessage[];
  introMessage: {
    prompt: string;
    helper: string | null;
  } | null;
  evaluationPlan: EvaluationPlan | null;
  evaluationProgress: {
    completedAttempts: number;
    scenarioCount: number;
    attemptStartedAt: Date | null;
  } | null;
  unitAdvanceGate: ReturnType<typeof getUnitAdvanceGate>;
}

/**
 * Takes a learning session id; produces the current AI workspace view; fails
 * only when the curriculum does not exist or the active unit is not ready.
 *
 * Shares the send path's turn resolution (next-ready projection + planned
 * recall), so what the learner sees on load is exactly the turn a submit would
 * run. Every read is bounded: the plan, the active unit's rows, the recall
 * candidates, and one unit's transcript — never the whole session history.
 */
export const getAiWorkspaceWorkflowEffect = ({
  sessionId,
}: {
  sessionId: string;
}): EffectType.Effect<
  AiWorkspaceView,
  DbError | CurriculumNotReadyError | UnitNotReadyError,
  WorkspaceProjectionReader | AiWorkspaceReader
> =>
  Effect.gen(function* () {
    const projectionReader = yield* WorkspaceProjectionReader;
    const displayReader = yield* AiWorkspaceReader;

    const plan = yield* projectionReader.getActivePlan(sessionId);
    if (!plan) {
      return yield* new CurriculumNotReadyError({
        message: "Curriculum is not ready yet.",
      });
    }

    const [active, inFlightRun] = yield* Effect.all(
      [
        loadNextReadyUnitProjection({ sessionId, nodes: plan.nodes }),
        projectionReader.getInFlightRecallRun(sessionId),
      ],
      { concurrency: 2 },
    );
    if (active.node && !active.unit) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: active.node.id,
      });
    }

    const activeScenarioAttemptId = active.responses
      .slice()
      .reverse()
      .find((response) => response.metadata?.scenarioAttemptId)
      ?.metadata?.scenarioAttemptId;

    // The active unit's transcript is fetched speculatively: it is the live
    // transcript unless a due recall wins below, and waiting for the recall
    // decision would serialize the common case behind it.
    const [plannedRecall, activeUnitMessages, attemptStartedAt] =
      yield* Effect.all(
        [
          loadPlannedRecall({
            sessionId,
            plan,
            active,
            inFlightRun,
            repairStaleRun: false,
          }),
          active.node
            ? displayReader.listUnitMessages(sessionId, active.node.id)
            : Effect.succeed<WorkspaceAiMessage[]>([]),
          active.unit && activeScenarioAttemptId
            ? displayReader.getScenarioAttemptStartedAt({
                scenarioAttemptId: activeScenarioAttemptId,
                nodeId: active.unit.nodeId,
              })
            : Effect.succeed(null),
        ],
        { concurrency: 3 },
      );

    const state = planWorkspaceTurn({
      nodes: plan.nodes,
      activeUnitResponses: active.responses,
      activeUnitRun: active.run,
      recallTarget: plannedRecall
        ? {
            unitNodeId: plannedRecall.node.id,
            unitTitle: plannedRecall.node.title,
          }
        : null,
    });

    // A recall interlude resumes the source unit's durable run cursor, exactly
    // as the send path resolves it — the view must report the same stage the
    // next submit will run.
    let resolvedState = state;
    if (state?.recallUnitId) {
      const recallNode = plan.nodes.find(
        (node) => node.id === state.recallUnitId,
      );
      const recallUnit = recallNode
        ? yield* projectionReader.getUnitByNodeId(recallNode.id)
        : null;
      if (!recallUnit) {
        return yield* new UnitNotReadyError({
          message: "UNIT_PREPARING",
          nodeId: recallNode?.id,
        });
      }
      const recallRun = resolveRecallRunProjection({
        sessionId,
        unit: recallUnit,
        existing: plannedRecall?.run ?? null,
      });
      resolvedState = {
        ...state,
        educationStage: recallRun.phase,
        workflowId: recallRun.recipeVersion,
      };
    }

    // Each unit is its own chat: show only the live unit's transcript (the
    // recall interlude, or the active unit). Earlier units live in the sidebar
    // as read-only history, not in the live scroll. Same precedence
    // findWorkspaceTurnNode uses to pick the unit messages are written under
    // (exactly one of the two is ever set — see orchestrator.ts), so this
    // matches the transcript the live turn appends to. With no runnable turn
    // the whole project transcript is the view.
    const liveUnitId = resolvedState
      ? (resolvedState.activeUnitId ?? resolvedState.recallUnitId)
      : null;
    const messages =
      liveUnitId == null
        ? yield* displayReader.listMessages(sessionId)
        : liveUnitId === active.node?.id
          ? activeUnitMessages
          : yield* displayReader.listUnitMessages(sessionId, liveUnitId);

    // Scenario-plan progress belongs to the active unit's education run; a
    // recall interlude is a single checkpoint with no plan to report.
    const isActiveUnitEducation =
      resolvedState?.mode === "education_unit" &&
      resolvedState.recallUnitId === null;
    const evaluationProgress = getEvaluationProgress(active.responses);
    const activeNode = active.node;
    const nextLearningNode =
      activeNode == null
        ? null
        : (plan.nodes.find(
            (node) =>
              (node.kind === "unit" || node.kind === "integration") &&
              node.orderIndex > activeNode.orderIndex,
          ) ?? null);

    return {
      plan,
      state: resolvedState,
      messages,
      evaluationPlan: isActiveUnitEducation
        ? evaluationProgress.latestPlan
        : null,
      evaluationProgress:
        isActiveUnitEducation && evaluationProgress.latestPlan
          ? {
              completedAttempts: evaluationProgress.completedAttempts,
              scenarioCount: evaluationProgress.latestPlan.scenarioCount,
              attemptStartedAt,
            }
          : null,
      unitAdvanceGate: getUnitAdvanceGate({
        node: active.node,
        run: active.run,
        nextNode: nextLearningNode,
      }),
      introMessage: buildWorkspaceIntroMessage({
        plan,
        state: resolvedState,
      }),
    };
  });

export const getAiWorkspaceWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GetAiWorkspaceDependencies;
}): Promise<Result<AiWorkspaceView, string | UnitNotReadyError>> => {
  const exit = await Effect.runPromiseExit(
    getAiWorkspaceWorkflowEffect({ sessionId }).pipe(
      Effect.provideService(
        WorkspaceProjectionReader,
        makeWorkspaceProjectionReader(deps),
      ),
      Effect.provideService(AiWorkspaceReader, makeAiWorkspaceReader(deps)),
    ),
  );

  if (Exit.isSuccess(exit)) return ok(exit.value);

  const failure = Cause.squash(exit.cause);
  if (failure instanceof CurriculumNotReadyError) {
    return err(failure.message);
  }
  if (failure instanceof UnitNotReadyError) {
    return err(failure);
  }
  throw failure;
};

export const buildWorkspaceIntroMessage = ({
  plan,
  state,
}: {
  plan: CurriculumPlan;
  state: WorkspaceAiState | null;
}) => {
  if (!state?.recallUnitId) {
    return null;
  }

  const recallUnit = plan.nodes.find((node) => node.id === state.recallUnitId);
  if (!recallUnit) {
    return null;
  }

  return {
    helper: "Recall",
    prompt: `Return to ${recallUnit.title}. Reconstruct the key distinction, mechanism, or procedure from memory before you move on.`,
  };
};
