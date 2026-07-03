import type { UnitTurnResult } from "../education-unit/orchestrate-unit-turn";
import type {
  PersistedUnitRun,
  UnitDifficultySnapshot,
  UnitEvent,
} from "../education-unit/unit";
import type {
  CurriculumPlan,
  Debrief,
  DifficultyBand,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type {
  WorkspaceAiEducationOutput,
  WorkspaceAiMessage,
  WorkspaceAiRecallOutput,
  WorkspaceAiState,
  WorkspaceAiTurnResult,
} from "./types";
import type { WorkspaceTurnDependencies } from "./workspace-turn";
import {
  getWorkspaceMessageSlot,
  planNextWorkspaceTurn,
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
  listMessages: (
    sessionId: string,
    slot?: "education_unit" | "recall",
  ) => Promise<WorkspaceAiMessage[]>;
  commitEducationTurn: (input: WorkspaceEducationTurnCommit) => Promise<{
    assistantMessage: WorkspaceAiMessage;
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
}

export type WorkspaceAiTurnPersistenceResult = WorkspaceAiTurnResult;

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

export interface WorkspaceAttemptCommit {
  sessionId: string;
  userId?: string | null;
  unitId: string;
  response: string;
  debrief: Debrief;
  seedResponse?: string | null;
  finalArticulation?: string | null;
  growthDimensions?: string[] | null;
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
  /**
   * Mastery check-offs commit atomically with the turn — a lost lease or a
   * failed commit must never leave checked entries without a mastered turn.
   */
  syllabusCheckOff: WorkspaceSyllabusCheckOffCommit | null;
  scenarioPresentation: {
    userId: string;
    nodeId: string;
    snapshot: UnitDifficultySnapshot;
    presentedAt: Date;
  } | null;
  solvePresentation: {
    scenarioAttemptId: string;
    presentedAt: Date;
  } | null;
  nextRun: PersistedUnitRun;
  completion: {
    nodeId: string;
    attempt: WorkspaceAttemptCommit;
  } | null;
  touchSessionId: string;
}

export interface WorkspaceSyllabusCheckOffCommit {
  clusterNodeId: string;
  requestedEntryIds: string[];
  targetedEntryIds: string[];
  evidenceNodeId: string;
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
  userMessage:
    | (Omit<WorkspaceUserMessageCommit, "slot"> & { slot: "recall" })
    | null;
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

/** A short, stable verdict word for the persisted phase-response metadata. */
const verdictLabel = (event: UnitEvent): string => {
  switch (event.type) {
    case "teach_done":
      return "teach_done";
    case "phase_continues":
      return event.reason;
    case "connection_graded":
      return event.connected ? "connected" : "not_connected";
    case "solution_graded":
      return event.passed ? "passed" : "not_passed";
  }
};

/**
 * A minimal completion debrief for a mastered unit. The v4 loop's evidence
 * lives in the transcript and the pass-2 solve grade, not in a structured
 * strengths/improvements payload, so this is deliberately thin.
 */
const buildUnitCompletionDebrief = (
  message: string,
  reasoning: string | null,
): Debrief => ({
  seedResponse: "",
  finalArticulation: message,
  growthDimensions: ["Completed the unit through both passes."],
  score: 100,
  readiness: "ready_for_next_unit",
  strengths: [reasoning ?? "Mastered the unit's transfer scenario."],
  improvements: ["Keep applying this under new, realistic constraints."],
  failureTags: [],
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
  manualDifficultySignal,
  turnId,
  turnLeaseId,
  persistUserMessage,
  phaseResponseSequence,
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
  persistUserMessage: boolean;
  phaseResponseSequence: number;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<WorkspaceAiTurnResult> => {
  const { assistantMessage } = await deps.commitRecallTurn({
    turnId,
    turnLeaseId,
    userMessage: persistUserMessage
      ? {
          sessionId,
          role: "user",
          content: message,
          slot: "recall",
          unitId: unit.nodeId,
          turnId,
        }
      : null,
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
      sequence: phaseResponseSequence,
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

/**
 * Persists one education-unit FSM turn: the user + assistant messages, a phase
 * response carrying the new phase, the advanced unit-run cursor, an optional
 * optional exactly-once Goldilocks write from the first scored pass-2 Solve,
 * completion attempt once the unit is mastered. The `state` fallback is only
 * used when the curriculum has no next runnable turn (unit just mastered and
 * awaiting the Next-Unit gate).
 */
export const saveUnitPhaseResult = async ({
  sessionId,
  userId,
  message,
  state,
  unit,
  plan,
  turnResult,
  ratingEvaluation,
  syllabusCheckOff = null,
  difficultySnapshot,
  scenarioAttemptId,
  difficultyDirectiveReason,
  turnId,
  turnLeaseId,
  persistUserMessage,
  phaseResponseSequence,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  state: WorkspaceAiState;
  unit: UnitContent;
  plan: CurriculumPlan;
  turnResult: UnitTurnResult;
  ratingEvaluation: WorkspaceRatingEvaluationCommit | null;
  syllabusCheckOff?: WorkspaceSyllabusCheckOffCommit | null;
  difficultySnapshot: UnitDifficultySnapshot;
  scenarioAttemptId: string | null;
  difficultyDirectiveReason?: string | null;
  turnId?: string | null;
  turnLeaseId?: string | null;
  persistUserMessage: boolean;
  phaseResponseSequence: number;
  deps: WorkspaceTurnPersistenceDependencies;
}): Promise<WorkspaceAiTurnPersistenceResult> => {
  const {
    nextState,
    event,
    forcedConnectAdvance,
    gradeReasoning,
    ratingWrite,
  } = turnResult;
  const aiMessage = turnResult.assistantMessage;
  const mastered = nextState.phase === "mastered";

  const nextRun: PersistedUnitRun = {
    ...nextState,
    sessionId,
    userId,
    difficultySnapshot,
    // The connect agent records a spec only when it poses a scenario; on every
    // other turn this is null, and the upsert coalesces null onto the stored
    // spec so it is preserved rather than wiped. See the repository.
    scenarioSpec: turnResult.scenarioSpec,
  };

  const scenarioPresentation =
    state.mode === "education_unit" &&
    nextRun.pass === 2 &&
    nextRun.phase === "connect" &&
    event.type === "phase_continues" &&
    event.reason === "prompted"
      ? {
          userId,
          nodeId: difficultySnapshot.nodeId,
          snapshot: difficultySnapshot,
          presentedAt: new Date(),
        }
      : null;
  const solvePresentation =
    nextRun.pass === 2 &&
    nextRun.phase === "solve" &&
    event.type === "phase_continues" &&
    event.reason === "prompted"
      ? scenarioAttemptId
        ? { scenarioAttemptId, presentedAt: new Date() }
        : (() => {
            throw new Error(
              "Pass-2 Solve cannot be presented without a scenario attempt.",
            );
          })()
      : null;

  const phaseResponse: WorkspacePhaseResponseCommit = {
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_education",
    sequence: phaseResponseSequence,
    userResponse: message,
    aiResponse: aiMessage,
    passed: mastered,
    score: ratingWrite?.score ?? null,
    metadata: {
      aiEducationStage: nextState.phase,
      phasePass: nextState.pass,
      forcedConnectAdvance: forcedConnectAdvance || undefined,
      promptKind: "education_unit",
      modelPurpose: "education",
      verdict: verdictLabel(event),
      difficultyDirectiveReason: difficultyDirectiveReason ?? undefined,
      goldilocksUpdated: ratingEvaluation ? true : undefined,
      feedback: aiMessage,
    },
  };

  const completion = mastered
    ? {
        nodeId: unit.nodeId,
        attempt: {
          sessionId,
          userId,
          unitId: unit.id,
          response: message,
          debrief: buildUnitCompletionDebrief(message, gradeReasoning),
          finalArticulation: message,
          growthDimensions: [] as string[],
        },
      }
    : null;

  const { assistantMessage } = await deps.commitEducationTurn({
    turnId,
    turnLeaseId,
    userMessage: persistUserMessage
      ? {
          sessionId,
          role: "user",
          content: message,
          slot: "education_unit",
          unitId: unit.nodeId,
          turnId,
        }
      : null,
    assistantMessage: {
      sessionId,
      role: "assistant",
      content: aiMessage,
      slot: "education_unit",
      unitId: unit.nodeId,
      turnId,
      metadata: getDifficultyDirectiveMetadata(difficultyDirectiveReason),
    },
    contracts: null,
    phaseResponse,
    ratingEvaluation,
    syllabusCheckOff,
    scenarioPresentation,
    solvePresentation,
    nextRun,
    completion,
    touchSessionId: sessionId,
  });

  const nextWorkspaceState = await planNextWorkspaceTurn({
    sessionId,
    plan,
    deps,
  });

  return {
    state: nextWorkspaceState ?? { ...state, educationStage: nextState.phase },
    messages: await deps.listMessages(
      sessionId,
      nextWorkspaceState
        ? getWorkspaceMessageSlot(nextWorkspaceState.mode)
        : "education_unit",
    ),
    assistantMessage,
  };
};
