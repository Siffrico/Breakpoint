import type {
  CurriculumNode,
  CurriculumPlan,
  Debrief,
  DifficultyBand,
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
import type { UnitRun, WorkspaceStepVerdict } from "./workflow";
import type { WorkspaceTurnDependencies } from "./workspace-turn";
import { validateScenarioContractAgainstUnit } from "./evaluation-contracts";
import { advanceUnitRun } from "./orchestrator";
import { passesUnitCompletionGate } from "./workflow";
import {
  getWorkspaceMessageSlot,
  planNextWorkspaceTurn,
  resolveUnitRunProjection,
} from "./workspace-turn";

export interface WorkspaceTurnPersistenceDependencies
  extends Omit<WorkspaceTurnDependencies, "getActivePlan"> {
  claimWorkspaceTurn?: (input: {
    sessionId: string;
    action: "submit_answer" | "next_scenario" | "adjust_difficulty";
    content: string;
    slot: string | null;
    unitId?: string | null;
    turnId: string;
    leaseId: string;
  }) => Promise<
    | { status: "claimed" }
    | { status: "processing" }
    | {
        status: "completed";
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
  updateScenarioContract: (input: {
    scenarioAttemptId: string;
    scenarioPrompt: string;
    scenarioContract: NonNullable<
      WorkspaceAiEducationOutput["scenarioEvaluationContract"]
    >;
  }) => Promise<unknown>;
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
  commitEducationTurn: (input: WorkspaceEducationTurnCommit) => Promise<{
    assistantMessage: WorkspaceAiMessage;
    nextReadyNode: CurriculumNode | null;
  }>;
  commitRecallTurn: (
    input: WorkspaceRecallTurnCommit,
  ) => Promise<{ assistantMessage: WorkspaceAiMessage }>;
  commitNextScenarioPrompt: (
    input: WorkspaceNextScenarioCommit,
  ) => Promise<{ assistantMessage: WorkspaceAiMessage }>;
  markWorkspaceTurnFailed?: (input: {
    sessionId: string;
    turnId: string;
    leaseId: string;
    reason: string;
  }) => Promise<void>;
  touchSession: (sessionId: string) => Promise<unknown>;
}

export type WorkspaceAiTurnPersistenceResult = WorkspaceAiTurnResult & {
  nextReadyNode?: CurriculumNode | null;
};

export interface WorkspaceOutputContractCommit {
  unitContentId: string;
  unitMasteryContract?: UnitContent["unitMasteryContract"];
  openScenarioContract?: {
    scenarioAttemptId: string;
    scenarioPrompt: string;
    scenarioContract: NonNullable<
      WorkspaceAiEducationOutput["scenarioEvaluationContract"]
    >;
  };
}

export interface WorkspaceAssistantMessageCommit {
  sessionId: string;
  role: "assistant";
  content: string;
  slot: "education_unit";
  unitId: string;
  turnId?: string | null;
  metadata?: WorkspaceAiMessage["metadata"];
}

export interface WorkspaceUserMessageCommit {
  sessionId: string;
  role: "user";
  content: string;
  slot: "education_unit";
  unitId: string;
  turnId?: string | null;
  metadata?: WorkspaceAiMessage["metadata"];
}

export interface WorkspacePhaseResponseCommit {
  unitContentId: string;
  sessionId: string;
  userId?: string | null;
  phase: PhaseResponseRecord["phase"];
  sequence?: number;
  userResponse: string;
  aiResponse?: string | null;
  passed?: boolean | null;
  score?: number | null;
  metadata?: PhaseResponseRecord["metadata"];
}

export interface WorkspaceEducationTurnCommit {
  turnId?: string | null;
  turnLeaseId?: string | null;
  userMessage: WorkspaceUserMessageCommit | null;
  assistantMessage: WorkspaceAssistantMessageCommit;
  contracts: WorkspaceOutputContractCommit | null;
  phaseResponse: WorkspacePhaseResponseCommit;
  ratingEvaluation: WorkspaceRatingEvaluationCommit | null;
  nextRun: UnitRun;
  completion: {
    nodeId: string;
    attempt: Parameters<WorkspaceTurnPersistenceDependencies["saveAttempt"]>[0];
  } | null;
  touchSessionId: string;
}

export interface WorkspaceRatingEvaluationCommit {
  scenarioAttemptId: string;
  userId: string;
  nodeId: string;
  score: number;
  errorCodes: readonly string[];
  wasOverTime: boolean;
  occurredAt: Date;
  bands: readonly DifficultyBand[] | null;
}

export interface WorkspaceRecallTurnCommit {
  turnId?: string | null;
  turnLeaseId?: string | null;
  assistantMessage: Omit<WorkspaceAssistantMessageCommit, "slot"> & {
    slot: "recall";
  };
  phaseResponse: WorkspacePhaseResponseCommit;
  touchSessionId: string;
}

export interface WorkspaceNextScenarioCommit {
  turnId?: string | null;
  turnLeaseId?: string | null;
  assistantMessage: WorkspaceAssistantMessageCommit;
  contracts: WorkspaceOutputContractCommit | null;
  phaseResponse: WorkspacePhaseResponseCommit;
  touchSessionId: string;
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

const CONTRACTED_SCENARIO_STAGES = new Set([
  "Diagnose",
  "Solve",
  "Review",
  "Test",
  "Check",
]);

const buildOutputContractCommit = ({
  unit,
  currentStage,
  output,
  scenarioAttemptId,
}: {
  unit: UnitContent;
  currentStage: WorkspaceAiState["educationStage"];
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  scenarioAttemptId: string | null;
}): WorkspaceOutputContractCommit | null => {
  const unitMasteryContract =
    output.unitMasteryContract ?? unit.unitMasteryContract ?? null;

  if (!output.unitMasteryContract && !output.scenarioEvaluationContract) {
    return null;
  }

  const commit: WorkspaceOutputContractCommit = {
    unitContentId: unit.id,
    unitMasteryContract: output.unitMasteryContract,
  };

  if (!output.scenarioEvaluationContract) return commit;

  if (!currentStage || !CONTRACTED_SCENARIO_STAGES.has(currentStage)) {
    return commit;
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

  if (!scenarioAttemptId) {
    throw new Error("Scenario evaluation contract has no scenario attempt.");
  }

  commit.openScenarioContract = {
    scenarioAttemptId,
    scenarioPrompt: output.assistantMessage,
    scenarioContract: output.scenarioEvaluationContract,
  };

  return commit;
};

const buildRatingEvaluationCommit = ({
  userId,
  output,
  attemptTiming,
  ratingNodeId,
  ratingBands,
  scenarioAttemptId,
}: {
  userId: string;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  attemptTiming?: AttemptTiming | null;
  ratingNodeId: string;
  ratingBands?: readonly DifficultyBand[] | null;
  scenarioAttemptId: string | null;
}): WorkspaceRatingEvaluationCommit | null => {
  if (!("dimensionResults" in output) || output.score == null) {
    return null;
  }
  if (!scenarioAttemptId) {
    throw new Error("Scored evaluation has no scenario attempt.");
  }

  return {
    scenarioAttemptId,
    userId,
    nodeId: ratingNodeId,
    score: output.score,
    errorCodes: output.dimensionResults.map(
      (dimensionResult) => dimensionResult.dimensionId,
    ),
    wasOverTime: attemptTiming?.wasOverTime ?? false,
    occurredAt: new Date(),
    bands: ratingBands ?? null,
  };
};

const buildPhaseEvent = ({
  sessionId,
  userId,
  message,
  unit,
  output,
  nextStepId,
  runtime,
  verdict,
  attemptTiming,
  evaluationPlan,
  difficultyDirectiveReason,
  scenarioAttemptId,
}: {
  sessionId: string;
  userId: string;
  message: string;
  unit: UnitContent;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  nextStepId: NonNullable<WorkspaceAiState["educationStage"]>;
  runtime: {
    promptKind: "education_unit" | "evaluate_feedback";
    modelPurpose: "education" | "evaluation";
  };
  verdict: WorkspaceStepVerdict;
  attemptTiming?: AttemptTiming | null;
  evaluationPlan?: EvaluationPlan | null;
  difficultyDirectiveReason?: string | null;
  scenarioAttemptId?: string | null;
}): WorkspacePhaseResponseCommit => ({
  unitContentId: unit.id,
  sessionId,
  userId,
  phase: "ai_education",
  userResponse: message,
  aiResponse: output.assistantMessage,
  passed: nextStepId === "completed",
  score: output.score,
  metadata: {
    aiEducationStage: nextStepId,
    promptKind: runtime.promptKind,
    modelPurpose: runtime.modelPurpose,
    verdict,
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
    scenarioAttemptId: scenarioAttemptId ?? undefined,
    difficultyDirectiveReason: difficultyDirectiveReason ?? undefined,
    estimatedItemRating: output.estimatedItemRating ?? undefined,
    feedback: output.assistantMessage,
    evidenceAnchors:
      "evidenceCitations" in output
        ? output.evidenceCitations
        : output.strengths,
  },
});

const buildCompletionCommit = ({
  sessionId,
  userId,
  message,
  unit,
  output,
  mastered,
}: {
  sessionId: string;
  userId: string;
  message: string;
  unit: UnitContent;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  mastered: boolean;
}): WorkspaceEducationTurnCommit["completion"] => {
  if (!mastered) {
    return null;
  }

  return {
    nodeId: unit.nodeId,
    attempt: {
      sessionId,
      userId,
      unitId: unit.id,
      response: message,
      debrief: buildCompletionDebrief({ message, output }),
      finalArticulation: message,
      growthDimensions: output.strengths,
    },
  };
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
  turnLeaseId,
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
  turnLeaseId?: string | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<WorkspaceAiTurnResult> => {
  const recallResponses = await deps.getPhaseResponses(unit.id, sessionId);
  const { assistantMessage } = await deps.commitRecallTurn({
    turnId,
    turnLeaseId,
    assistantMessage: {
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "recall",
      unitId: unit.nodeId,
      turnId,
      metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
    },
    phaseResponse: {
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
    },
    touchSessionId: sessionId,
  });

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
  verdict,
  difficultyDirectiveReason,
  ratingNodeId,
  ratingBands,
  scenarioAttemptId,
  turnId,
  turnLeaseId,
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
  verdict: WorkspaceStepVerdict;
  difficultyDirectiveReason?: string | null;
  ratingNodeId: string;
  ratingBands?: readonly DifficultyBand[] | null;
  scenarioAttemptId: string | null;
  turnId?: string | null;
  turnLeaseId?: string | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<WorkspaceAiTurnPersistenceResult> => {
  if (!state.educationStage) {
    throw new Error("Education stage is missing.");
  }

  const evaluationComplete =
    !evaluationPlan ||
    priorEvaluationAttempts + 1 >= evaluationPlan.scenarioCount;

  const contracts = buildOutputContractCommit({
    unit,
    currentStage: state.educationStage,
    output,
    scenarioAttemptId,
  });

  const currentRun = await resolveUnitRunProjection({
    sessionId,
    userId,
    unit,
    unitResponses: [],
    fallbackStepId: state.educationStage,
    deps,
  });

  const isScoredAttempt = "dimensionResults" in output;
  const ratingEvaluation = buildRatingEvaluationCommit({
    userId,
    output,
    attemptTiming,
    ratingNodeId,
    ratingBands,
    scenarioAttemptId,
  });
  const mastered = passesUnitCompletionGate({
    stepId: state.educationStage,
    verdict,
    evaluationComplete,
  });
  const nextRun = advanceUnitRun({
    run: currentRun,
    outcome: {
      stepId: state.educationStage,
      verdict,
      mastered,
      scenarioCompleted: isScoredAttempt && evaluationComplete,
      retryCount: priorEvaluationAttempts,
    },
  });
  const phaseResponse = buildPhaseEvent({
    sessionId,
    userId,
    message,
    unit,
    output,
    nextStepId: nextRun.currentStepId,
    runtime: {
      promptKind:
        "dimensionResults" in output ? "evaluate_feedback" : "education_unit",
      modelPurpose: "dimensionResults" in output ? "evaluation" : "education",
    },
    verdict,
    attemptTiming,
    evaluationPlan,
    difficultyDirectiveReason,
    scenarioAttemptId,
  });
  const completion = buildCompletionCommit({
    sessionId,
    userId,
    message,
    unit,
    output,
    mastered,
  });
  const { assistantMessage, nextReadyNode } = await deps.commitEducationTurn({
    turnId,
    turnLeaseId,
    userMessage: {
      sessionId,
      role: "user",
      content: message,
      slot: "education_unit",
      unitId: unit.nodeId,
      turnId,
    },
    assistantMessage: {
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "education_unit",
      unitId: unit.nodeId,
      turnId,
      metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
    },
    contracts,
    phaseResponse,
    ratingEvaluation,
    nextRun,
    completion,
    touchSessionId: sessionId,
  });

  const nextState = await planNextWorkspaceTurn({
    sessionId,
    plan,
    deps,
  });

  return {
    state: nextState ?? { ...state, educationStage: nextRun.currentStepId },
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
  scenarioAttemptId,
  turnId,
  turnLeaseId,
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
  scenarioAttemptId: string | null;
  turnId?: string | null;
  turnLeaseId?: string | null;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<void> => {
  if (!currentStage) {
    throw new Error("Education stage is missing.");
  }

  const contracts = buildOutputContractCommit({
    unit,
    currentStage,
    output,
    scenarioAttemptId,
  });

  const educationResponses = await deps.getPhaseResponses(unit.id, sessionId);
  await deps.commitNextScenarioPrompt({
    turnId,
    turnLeaseId,
    assistantMessage: {
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "education_unit",
      unitId: unit.nodeId,
      turnId,
      metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
    },
    contracts,
    phaseResponse: {
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
        scenarioAttemptId: scenarioAttemptId ?? undefined,
        manualDifficultySignal: manualDifficultySignal ?? undefined,
        evaluationPlan:
          "evaluationPlan" in output
            ? (evaluationPlan ?? output.evaluationPlan)
            : undefined,
        difficultyDirectiveReason: difficultyDirectiveReason ?? undefined,
        estimatedItemRating: output.estimatedItemRating ?? undefined,
        feedback: output.assistantMessage,
      },
    },
    touchSessionId: sessionId,
  });
};
