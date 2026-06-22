import type {
  CurriculumNode,
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
import { validateScenarioContractAgainstUnit } from "./evaluation-contracts";
import { normalizeEducationStageTransition } from "./orchestrator";
import {
  getWorkspaceMessageSlot,
  planNextWorkspaceTurn,
} from "./workspace-turn";

export interface WorkspaceTurnPersistenceDependencies
  extends Omit<WorkspaceTurnDependencies, "getActivePlan"> {
  claimWorkspaceTurn?: (input: {
    sessionId: string;
    content: string;
    slot: string | null;
    unitId?: string | null;
    turnId: string;
    hiddenFromTranscript?: boolean;
  }) => Promise<
    | { status: "claimed"; message: WorkspaceAiMessage }
    | { status: "processing"; message: WorkspaceAiMessage }
    | {
        status: "completed";
        userMessage: WorkspaceAiMessage | null;
        assistantMessage: WorkspaceAiMessage;
      }
  >;
  appendMessage: (input: {
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
    unitId?: string | null;
    turnId?: string | null;
    metadata?: WorkspaceAiMessage["metadata"];
  }) => Promise<WorkspaceAiMessage | null>;
  listMessagesByTurnId?: (
    sessionId: string,
    turnId: string,
  ) => Promise<WorkspaceAiMessage[]>;
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
  updateUnitMasteryContract: (input: {
    unitContentId: string;
    unitMasteryContract: UnitContent["unitMasteryContract"];
  }) => Promise<unknown>;
  updateOpenScenarioContract: (input: {
    userId: string;
    nodeId: string;
    scenarioPrompt: string;
    scenarioContract: NonNullable<
      WorkspaceAiEducationOutput["scenarioEvaluationContract"]
    >;
  }) => Promise<unknown>;
  recordEvaluation?: (input: {
    userId: string;
    nodeId: string;
    score: number | null | undefined;
    errorCodes: readonly string[];
    wasOverTime: boolean;
    occurredAt: Date;
    bands?: UnitContent["difficultyBands"];
  }) => Promise<{ mastered: boolean }>;
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
  completeNode: (nodeId: string) => Promise<CurriculumNode | null>;
  touchSession: (sessionId: string) => Promise<unknown>;
}

export type WorkspaceAiTurnPersistenceResult = WorkspaceAiTurnResult & {
  nextReadyNode?: CurriculumNode | null;
};

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

/**
 * Score (0–100) at which a single education unit counts as complete. Unit
 * completion is score-based; job (cluster) completion is ELO-based. The ELO
 * mastery gate belongs at the job level, not here — gating a unit on mastery
 * gives it no non-mastery exit and lets it loop forever.
 */
const UNIT_COMPLETION_SCORE = 90;

const CONTRACTED_SCENARIO_STAGES = new Set([
  "diagnostic_scenario",
  "guided_application",
  "performance_evaluation",
  "transfer_scenario",
]);

const persistOutputContracts = async ({
  userId,
  unit,
  currentStage,
  output,
  deps,
}: {
  userId: string;
  unit: UnitContent;
  currentStage: WorkspaceAiState["educationStage"];
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  deps: WorkspaceTurnPersistenceDependencies;
}) => {
  const unitMasteryContract =
    output.unitMasteryContract ?? unit.unitMasteryContract ?? null;

  if (output.unitMasteryContract) {
    await deps.updateUnitMasteryContract({
      unitContentId: unit.id,
      unitMasteryContract: output.unitMasteryContract,
    });
  }

  if (!output.scenarioEvaluationContract) return;

  if (!currentStage || !CONTRACTED_SCENARIO_STAGES.has(currentStage)) {
    return;
  }

  if (!unitMasteryContract) {
    throw new Error(
      "Scenario evaluation contract cannot be persisted without a unit mastery contract.",
    );
  }

  validateScenarioContractAgainstUnit({
    unitContract: unitMasteryContract,
    scenarioContract: output.scenarioEvaluationContract,
  });

  const updatedScenario = await deps.updateOpenScenarioContract({
    userId,
    nodeId: unit.nodeId,
    scenarioPrompt: output.assistantMessage,
    scenarioContract: output.scenarioEvaluationContract,
  });

  if (!updatedScenario) {
    throw new Error(
      "Scenario evaluation contract could not be attached to an open scenario.",
    );
  }
};

/**
 * Fold one scored attempt into the per-unit ELO rating. This keeps Goldilocks
 * scenario difficulty calibrated and feeds the job-level mastery check — it no
 * longer decides whether the unit is complete (that is score-based). Failures
 * are swallowed: a missed rating update must not block the learner's turn.
 */
const recordAttemptRating = async ({
  userId,
  unit,
  output,
  attemptTiming,
  deps,
}: {
  userId: string;
  unit: UnitContent;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  attemptTiming?: AttemptTiming | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<void> => {
  if (!("dimensionResults" in output) || !deps.recordEvaluation) {
    return;
  }

  try {
    await deps.recordEvaluation({
      userId,
      nodeId: unit.nodeId,
      score: output.score,
      errorCodes: output.dimensionResults.map(
        (dimensionResult) => dimensionResult.dimensionId,
      ),
      wasOverTime: attemptTiming?.wasOverTime ?? false,
      occurredAt: new Date(),
      bands: unit.difficultyBands,
    });
  } catch (error) {
    console.error("Training rating evaluation recording failed", {
      userId,
      nodeId: unit.nodeId,
      error,
    });
  }
};

export const saveRecallTurnResult = async ({
  sessionId,
  userId,
  message,
  state,
  unit,
  plan,
  output,
  difficultyDirectiveReason,
  manualDifficultySignal,
  turnId,
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
  manualDifficultySignal?: "too_easy" | "too_hard" | null;
  turnId?: string | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<WorkspaceAiTurnResult> => {
  const assistantMessage = await deps.appendMessage({
    sessionId,
    role: "assistant",
    content: output.assistantMessage,
    slot: "recall",
    unitId: unit.nodeId,
    turnId,
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
      manualDifficultySignal: manualDifficultySignal ?? undefined,
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
  turnId,
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
  turnId?: string | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<WorkspaceAiTurnPersistenceResult> => {
  if (!state.educationStage) {
    throw new Error("Education stage is missing.");
  }

  const evaluationComplete =
    !evaluationPlan ||
    priorEvaluationAttempts + 1 >= evaluationPlan.scenarioCount;

  const assistantMessage = await deps.appendMessage({
    sessionId,
    role: "assistant",
    content: output.assistantMessage,
    slot: "education_unit",
    unitId: unit.nodeId,
    turnId,
    metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
  });

  if (!assistantMessage) {
    throw new Error("AI response could not be saved.");
  }

  await persistOutputContracts({
    userId,
    unit,
    currentStage: state.educationStage,
    output,
    deps,
  });

  // Keep the per-unit ELO rating current on every scored attempt — it drives
  // Goldilocks difficulty and the job-level mastery check — but it no longer
  // gates completion. The unit completes on score; the job completes on ELO.
  await recordAttemptRating({ userId, unit, output, attemptTiming, deps });

  const isScoredAttempt = "dimensionResults" in output;
  const stageComplete = output.stageComplete && evaluationComplete;
  const unitComplete =
    isScoredAttempt &&
    (output.score ?? 0) >= UNIT_COMPLETION_SCORE &&
    evaluationComplete;
  const nextStage = normalizeEducationStageTransition({
    currentStage: state.educationStage,
    requestedStage: output.nextStage,
    stageComplete,
    unitComplete,
    allowRepairRoute:
      "routingDecision" in output && output.routingDecision === "repair",
  });

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
      dimensionResults:
        "dimensionResults" in output ? output.dimensionResults : undefined,
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

  let nextReadyNode: CurriculumNode | null = null;
  if (unitComplete) {
    await deps.saveAttempt({
      sessionId,
      userId,
      unitId: unit.id,
      response: message,
      debrief: buildCompletionDebrief({ message, output }),
      finalArticulation: message,
      growthDimensions: output.strengths,
    });
    nextReadyNode = await deps.completeNode(unit.nodeId);
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
    nextReadyNode,
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
  manualDifficultySignal,
  turnId,
  deps,
}: {
  sessionId: string;
  userId: string;
  unit: UnitContent;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  evaluationPlan?: EvaluationPlan | null;
  currentStage: WorkspaceAiState["educationStage"];
  difficultyDirectiveReason?: string | null;
  manualDifficultySignal?: "too_easy" | "too_hard" | null;
  turnId?: string | null;
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
    turnId,
    metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
  });

  if (!assistantMessage) {
    throw new Error("AI response could not be saved.");
  }

  await persistOutputContracts({
    userId,
    unit,
    currentStage,
    output,
    deps,
  });

  const educationResponses = await deps.getPhaseResponses(unit.id, sessionId);
  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_education",
    sequence: countPhaseResponses(educationResponses, "ai_education"),
    userResponse: manualDifficultySignal
      ? `[difficulty_adjustment:${manualDifficultySignal}]`
      : "[next_scenario_requested]",
    aiResponse: output.assistantMessage,
    passed: null,
    score: null,
    metadata: {
      aiEducationStage: currentStage,
      promptKind: "evaluate_feedback",
      modelPurpose: "evaluation",
      nextScenarioPrompt: true,
      manualDifficultySignal: manualDifficultySignal ?? undefined,
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
