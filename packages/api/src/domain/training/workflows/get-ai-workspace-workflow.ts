import type { Result } from "../../../lib/result";
import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type {
  EvaluationPlan,
  WorkspaceAiMessage,
  WorkspaceAiState,
} from "../workspace-ai/types";
import { err, ok } from "../../../lib/result";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { getEvaluationProgress } from "../workspace-ai/evaluation-plan";
import { planWorkspaceTurn } from "../workspace-ai/orchestrator";
import {
  getUnitAdvanceGate,
  resolveUnitRunProjection,
} from "../workspace-ai/workspace-turn";

interface GetAiWorkspaceDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  listMessages: (
    sessionId: string,
    slot?: "education_unit" | "recall",
  ) => Promise<WorkspaceAiMessage[]>;
  listPhaseResponsesBySession: (
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Promise<PersistedUnitRun | null>;
  upsertUnitRun: (run: PersistedUnitRun) => Promise<PersistedUnitRun>;
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  prepareUnit: (input: {
    node: CurriculumNode;
    sessionId: string;
  }) => Promise<unknown>;
  /**
   * Keeps the fire-and-forget preparation alive past the response on
   * serverless hosts (Next.js `after`). Falls back to a detached promise.
   */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
  getScenarioAttemptStartedAt: (input: {
    scenarioAttemptId: string;
    nodeId: string;
  }) => Promise<Date | null>;
}

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
 * only when the curriculum does not exist or the active unit cannot be prepared.
 */
export const getAiWorkspaceWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GetAiWorkspaceDependencies;
}): Promise<Result<AiWorkspaceView, string | UnitNotReadyError>> => {
  const [plan, messages, allResponses] = await Promise.all([
    deps.getActivePlan(sessionId),
    deps.listMessages(sessionId),
    deps.listPhaseResponsesBySession(sessionId),
  ]);

  if (!plan) {
    return err("Curriculum is not ready yet.");
  }

  // Read paths never create unit content. On a miss, start the real generator
  // in the background and tell the client to retry; `scheduleBackgroundTask`
  // (Next.js `after`) keeps the generation alive past this response on
  // serverless hosts.
  const firePrepareUnit = (node: CurriculumNode) => {
    const task = () =>
      deps.prepareUnit({ node, sessionId }).then(
        () => undefined,
        (error: unknown) => {
          console.error("Workspace unit preparation failed", {
            nodeId: node.id,
            error,
          });
        },
      );
    if (deps.scheduleBackgroundTask) {
      deps.scheduleBackgroundTask(task);
    } else {
      void task();
    }
  };

  const activeUnitNode = getNextReadyLearningNode(plan.nodes);
  const activeUnit = activeUnitNode
    ? await deps.getUnitByNodeId(activeUnitNode.id)
    : null;
  if (activeUnitNode && !activeUnit) {
    firePrepareUnit(activeUnitNode);
    return err(
      new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: activeUnitNode.id,
      }),
    );
  }
  const activeUnitResponses = activeUnit
    ? await deps.getPhaseResponses(activeUnit.id, sessionId)
    : [];
  const activeUnitRun = activeUnit
    ? await resolveUnitRunProjection({
        sessionId,
        unit: activeUnit,
        deps,
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
    const unit = recallNode ? await deps.getUnitByNodeId(recallNode.id) : null;
    if (!unit) {
      if (recallNode) {
        firePrepareUnit(recallNode);
      }
      return err(
        new UnitNotReadyError({
          message: "UNIT_PREPARING",
          nodeId: recallNode?.id,
        }),
      );
    }
  }

  const activeMessages = state
    ? await deps.listMessages(sessionId, getWorkspaceMessageSlot(state.mode))
    : messages;
  const evaluationProgress = getEvaluationProgress(activeUnitResponses);
  const activeScenarioAttemptId = activeUnitResponses
    .slice()
    .reverse()
    .find((response) => response.metadata?.scenarioAttemptId)
    ?.metadata?.scenarioAttemptId;
  const attemptStartedAt =
    activeUnit && activeScenarioAttemptId
      ? await deps.getScenarioAttemptStartedAt({
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

  return ok({
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
  });
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
