import type {
  CurriculumPlan,
  Debrief,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type {
  AttemptTiming,
  EvaluationPlan,
  WorkspaceAiEducationOutput,
  WorkspaceAiEvaluationOutput,
  WorkspaceAiMessage,
  WorkspaceAiRecallOutput,
  WorkspaceAiState,
  WorkspaceAiTurnResult,
} from "./types";
import type { WorkspaceTurnDependencies } from "./workspace-turn";
import { normalizeEducationStageTransition } from "./orchestrator";
import {
  getWorkspaceMessageSlot,
  planNextWorkspaceTurn,
} from "./workspace-turn";

export interface WorkspaceTurnPersistenceDependencies
  extends Omit<WorkspaceTurnDependencies, "getActivePlan"> {
  appendMessage: (input: {
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
    unitId?: string | null;
    metadata?: WorkspaceAiMessage["metadata"];
  }) => Promise<WorkspaceAiMessage | null>;
  listMessages: (
    sessionId: string,
    slot?: "education_unit" | "recall",
  ) => Promise<WorkspaceAiMessage[]>;
  savePhaseResponse: (input: {
    unitContentId: string;
    sessionId: string;
    userId?: string | null;
    phase: PhaseResponseRecord["phase"];
    sequence: number;
    userResponse: string;
    aiResponse?: string | null;
    passed?: boolean | null;
    score?: number | null;
    metadata?: PhaseResponseRecord["metadata"];
  }) => Promise<PhaseResponseRecord | null>;
  saveAttempt: (input: {
    sessionId: string;
    userId?: string | null;
    unitId: string;
    response: string;
    debrief: Debrief;
    seedResponse?: string | null;
    finalArticulation?: string | null;
    growthDimensions?: string[] | null;
  }) => Promise<unknown>;
  completeNode: (nodeId: string) => Promise<unknown>;
  touchSession: (sessionId: string) => Promise<unknown>;
}

const getDifficultyDirectiveMetadata = (reason?: string | null) =>
  reason ? { difficultyDirectiveReason: reason } : null;

const countPhaseResponses = (
  responses: PhaseResponseRecord[],
  phase: PhaseResponseRecord["phase"],
) => responses.filter((response) => response.phase === phase).length;

const buildCompletionDebrief = ({
  message,
  output,
}: {
  message: string;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
}): Debrief => ({
  seedResponse: "",
  finalArticulation: message,
  growthDimensions:
    output.strengths.length > 0 ? output.strengths : ["Completed the unit."],
  score: output.score ?? 0,
  readiness: "ready_for_next_unit",
  strengths:
    output.strengths.length > 0 ? output.strengths : ["Completed the unit."],
  improvements:
    output.improvements.length > 0
      ? output.improvements
      : ["Continue applying this under realistic constraints."],
  failureTags: output.improvements,
  nextStep: "Continue to the next training unit.",
});

export const saveRecallTurnResult = async ({
  sessionId,
  userId,
  message,
  state,
  unit,
  plan,
  output,
  difficultyDirectiveReason,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  state: WorkspaceAiState;
  unit: UnitContent;
  plan: CurriculumPlan;
  output: WorkspaceAiRecallOutput;
  difficultyDirectiveReason?: string | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<WorkspaceAiTurnResult> => {
  const assistantMessage = await deps.appendMessage({
    sessionId,
    role: "assistant",
    content: output.assistantMessage,
    slot: "recall",
    unitId: unit.nodeId,
    metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
  });

  if (!assistantMessage) {
    throw new Error("AI response could not be saved.");
  }

  const recallResponses = await deps.getPhaseResponses(unit.id, sessionId);
  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_recall",
    sequence: countPhaseResponses(recallResponses, "ai_recall"),
    userResponse: message,
    aiResponse: output.assistantMessage,
    passed: output.recallComplete,
    score: output.score,
    metadata: {
      recallUnitId: unit.nodeId,
      promptKind: "recall",
      modelPurpose: "recall",
      difficultyDirectiveReason: difficultyDirectiveReason ?? undefined,
      estimatedItemRating: output.estimatedItemRating ?? undefined,
      feedback: output.assistantMessage,
      evidenceAnchors: output.strengths,
    },
  });

  await deps.touchSession(sessionId);

  const nextState = await planNextWorkspaceTurn({ sessionId, plan, deps });

  return {
    state: nextState ?? state,
    messages: await deps.listMessages(sessionId, "recall"),
    assistantMessage,
  };
};

export const saveEducationTurnResult = async ({
  sessionId,
  userId,
  message,
  state,
  unit,
  plan,
  output,
  attemptTiming,
  evaluationPlan,
  priorEvaluationAttempts,
  difficultyDirectiveReason,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  state: WorkspaceAiState;
  unit: UnitContent;
  plan: CurriculumPlan;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  attemptTiming?: AttemptTiming | null;
  evaluationPlan?: EvaluationPlan | null;
  priorEvaluationAttempts: number;
  difficultyDirectiveReason?: string | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<WorkspaceAiTurnResult> => {
  if (!state.educationStage) {
    throw new Error("Education stage is missing.");
  }

  const evaluationComplete =
    !evaluationPlan ||
    priorEvaluationAttempts + 1 >= evaluationPlan.scenarioCount;
  const stageComplete = output.stageComplete && evaluationComplete;
  const nextStage = normalizeEducationStageTransition({
    currentStage: state.educationStage,
    requestedStage: output.nextStage,
    stageComplete,
    unitComplete: output.unitComplete && evaluationComplete,
    allowRepairRoute:
      "routingDecision" in output && output.routingDecision === "repair",
  });

  const assistantMessage = await deps.appendMessage({
    sessionId,
    role: "assistant",
    content: output.assistantMessage,
    slot: "education_unit",
    unitId: unit.nodeId,
    metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
  });

  if (!assistantMessage) {
    throw new Error("AI response could not be saved.");
  }

  const educationResponses = await deps.getPhaseResponses(unit.id, sessionId);
  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_education",
    sequence: countPhaseResponses(educationResponses, "ai_education"),
    userResponse: message,
    aiResponse: output.assistantMessage,
    passed: nextStage === "completed",
    score: output.score,
    metadata: {
      aiEducationStage: nextStage,
      promptKind:
        "routingDecision" in output ? "evaluate_feedback" : "education_unit",
      modelPurpose: "routingDecision" in output ? "evaluation" : "education",
      routingDecision:
        "routingDecision" in output ? output.routingDecision : undefined,
      evaluationSummary:
        "evaluationSummary" in output ? output.evaluationSummary : undefined,
      failedDimensions:
        "failedDimensions" in output ? output.failedDimensions : undefined,
      evaluationPlan:
        "evaluationPlan" in output
          ? (evaluationPlan ?? output.evaluationPlan)
          : undefined,
      attemptTiming: attemptTiming ?? undefined,
      difficultyDirectiveReason: difficultyDirectiveReason ?? undefined,
      estimatedItemRating: output.estimatedItemRating ?? undefined,
      feedback: output.assistantMessage,
      evidenceAnchors:
        "evidenceCitations" in output
          ? output.evidenceCitations
          : output.strengths,
    },
  });

  if (nextStage === "completed") {
    await deps.saveAttempt({
      sessionId,
      userId,
      unitId: unit.id,
      response: message,
      debrief: buildCompletionDebrief({ message, output }),
      finalArticulation: message,
      growthDimensions: output.strengths,
    });
    await deps.completeNode(unit.nodeId);
  }

  await deps.touchSession(sessionId);

  const nextState = await planNextWorkspaceTurn({
    sessionId,
    plan: {
      ...plan,
      nodes:
        nextStage === "completed"
          ? plan.nodes.map((node) =>
              node.id === unit.nodeId ? { ...node, status: "completed" } : node,
            )
          : plan.nodes,
    },
    deps,
  });

  return {
    state: nextState ?? { ...state, educationStage: nextStage },
    messages: await deps.listMessages(
      sessionId,
      nextState ? getWorkspaceMessageSlot(nextState.mode) : "education_unit",
    ),
    assistantMessage,
  };
};

export const saveNextScenarioPrompt = async ({
  sessionId,
  userId,
  unit,
  output,
  evaluationPlan,
  currentStage,
  difficultyDirectiveReason,
  deps,
}: {
  sessionId: string;
  userId: string;
  unit: UnitContent;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  evaluationPlan?: EvaluationPlan | null;
  currentStage: WorkspaceAiState["educationStage"];
  difficultyDirectiveReason?: string | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<void> => {
  if (!currentStage) {
    throw new Error("Education stage is missing.");
  }

  const assistantMessage = await deps.appendMessage({
    sessionId,
    role: "assistant",
    content: output.assistantMessage,
    slot: "education_unit",
    unitId: unit.nodeId,
    metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
  });

  if (!assistantMessage) {
    throw new Error("AI response could not be saved.");
  }

  const educationResponses = await deps.getPhaseResponses(unit.id, sessionId);
  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_education",
    sequence: countPhaseResponses(educationResponses, "ai_education"),
    userResponse: "[next_scenario_requested]",
    aiResponse: output.assistantMessage,
    passed: null,
    score: null,
    metadata: {
      aiEducationStage: currentStage,
      promptKind: "evaluate_feedback",
      modelPurpose: "evaluation",
      nextScenarioPrompt: true,
      evaluationPlan:
        "evaluationPlan" in output
          ? (evaluationPlan ?? output.evaluationPlan)
          : undefined,
      difficultyDirectiveReason: difficultyDirectiveReason ?? undefined,
      estimatedItemRating: output.estimatedItemRating ?? undefined,
      feedback: output.assistantMessage,
    },
  });

  await deps.touchSession(sessionId);
};
