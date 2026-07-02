import type { Effect as EffectType } from "effect";
import { Cause, Effect, Exit } from "effect";

import type { DbError } from "../../../effect/errors";
import type { Result } from "../../../lib/result";
import type { CurriculumNode, CurriculumPlan } from "../types/training.types";
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
  resolveUnitRunProjection,
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
    canRequestNextScenario: boolean;
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
    const [plan, messages, allResponses] = yield* Effect.all(
      [
        projectionReader.getActivePlan(sessionId),
        displayReader.listMessages(sessionId),
        projectionReader.listPhaseResponsesBySession(sessionId),
      ],
      { concurrency: 3 },
    );

    if (!plan) {
      return yield* new CurriculumNotReadyError({
        message: "Curriculum is not ready yet.",
      });
    }

    const activeUnitNode = getNextReadyLearningNode(plan.nodes);
    const activeUnit = activeUnitNode
      ? yield* projectionReader.getUnitByNodeId(activeUnitNode.id)
      : null;
    if (activeUnitNode && !activeUnit) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: activeUnitNode.id,
      });
    }
    const [activeUnitResponses, existingActiveUnitRun] = activeUnit
      ? yield* Effect.all(
          [
            projectionReader.getPhaseResponses(activeUnit.id, sessionId),
            projectionReader.getUnitRun(sessionId, activeUnit.id),
          ],
          { concurrency: 2 },
        )
      : [[], null];
    const activeUnitRun = activeUnit
      ? resolveUnitRunProjection({
          sessionId,
          unit: activeUnit,
          existing: existingActiveUnitRun,
        })
      : null;

    const state = planWorkspaceTurn({
      nodes: plan.nodes,
      allResponses,
      activeUnitResponses,
      activeUnitRun,
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

    const activeMessages = state
      ? yield* displayReader.listMessages(
          sessionId,
          getWorkspaceMessageSlot(state.mode),
        )
      : messages;
    const evaluationProgress = getEvaluationProgress(activeUnitResponses);
    const activeScenarioAttemptId = activeUnitResponses
      .slice()
      .reverse()
      .find((response) => response.metadata?.scenarioAttemptId)
      ?.metadata?.scenarioAttemptId;
    const attemptStartedAt =
      activeUnit && activeScenarioAttemptId
        ? yield* displayReader.getScenarioAttemptStartedAt({
            scenarioAttemptId: activeScenarioAttemptId,
            nodeId: activeUnit.nodeId,
          })
        : null;
    const nextLearningNode =
      activeUnitNode == null
        ? null
        : (plan.nodes.find(
            (node) =>
              (node.kind === "unit" || node.kind === "integration") &&
              node.orderIndex > activeUnitNode.orderIndex,
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
              canRequestNextScenario: evaluationProgress.canRequestNextScenario,
              attemptStartedAt,
            }
          : null,
      unitAdvanceGate: getUnitAdvanceGate({
        node: activeUnitNode,
        run: activeUnitRun,
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

const getNextReadyLearningNode = (nodes: CurriculumNode[]) =>
  nodes.find(
    (node) =>
      (node.kind === "unit" || node.kind === "integration") &&
      node.status === "ready",
  ) ?? null;

const getWorkspaceMessageSlot = (mode: WorkspaceAiState["mode"]) =>
  mode === "recall" ? "recall" : "education_unit";

export const buildWorkspaceIntroMessage = ({
  plan,
  state,
}: {
  plan: CurriculumPlan;
  state: WorkspaceAiState | null;
}) => {
  if (state?.mode !== "recall" || !state.recallUnitId) {
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
