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
    const [plan, messages, educationUnitMessages, allResponses] =
      yield* Effect.all(
        [
          projectionReader.getActivePlan(sessionId),
          displayReader.listMessages(sessionId),
          displayReader.listMessages(sessionId, "education_unit"),
          projectionReader.listPhaseResponsesBySession(sessionId),
        ],
        { concurrency: 4 },
      );

    if (!plan) {
      return yield* new CurriculumNotReadyError({
        message: "Curriculum is not ready yet.",
      });
    }

    const active = yield* loadNextReadyUnitProjection({
      sessionId,
      nodes: plan.nodes,
    });
    if (active.node && !active.unit) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: active.node.id,
      });
    }

    const state = planWorkspaceTurn({
      nodes: plan.nodes,
      allResponses,
      activeUnitResponses: active.responses,
      activeUnitRun: active.run,
    });

    if (state?.recallUnitId) {
      const recallNode = plan.nodes.find(
        (node) => node.id === state.recallUnitId,
      );
      const unit = recallNode
        ? yield* projectionReader.getUnitByNodeId(recallNode.id)
        : null;
      if (!unit) {
        return yield* new UnitNotReadyError({
          message: "UNIT_PREPARING",
          nodeId: recallNode?.id,
        });
      }
    }

    // Each unit is its own chat: show only the live unit's transcript (the
    // recall interlude, or the active unit). Earlier units live in the sidebar
    // as read-only history, not in the live scroll.
    // Same precedence findWorkspaceTurnNode uses to pick the unit messages are
    // written under (exactly one of the two is ever set — see orchestrator.ts),
    // so this filter matches the transcript the live turn appends to.
    const liveUnitId = state
      ? (state.activeUnitId ?? state.recallUnitId)
      : null;
    const activeMessages = !state
      ? messages
      : liveUnitId
        ? educationUnitMessages.filter(
            (message) => message.unitId === liveUnitId,
          )
        : educationUnitMessages;
    const evaluationProgress = getEvaluationProgress(active.responses);
    const activeScenarioAttemptId = active.responses
      .slice()
      .reverse()
      .find((response) => response.metadata?.scenarioAttemptId)
      ?.metadata?.scenarioAttemptId;
    const attemptStartedAt =
      active.unit && activeScenarioAttemptId
        ? yield* displayReader.getScenarioAttemptStartedAt({
            scenarioAttemptId: activeScenarioAttemptId,
            nodeId: active.unit.nodeId,
          })
        : null;
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
      state,
      messages: activeMessages,
      evaluationPlan:
        state?.mode === "education_unit" ? evaluationProgress.latestPlan : null,
      evaluationProgress:
        state?.mode === "education_unit" && evaluationProgress.latestPlan
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
        state,
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
