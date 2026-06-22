import type { Memory } from "../../memory/types";
import type {
  CurriculumNode,
  DifficultyBand,
  PhaseResponseRecord,
  ScenarioEvaluationContract,
} from "../types/training.types";
import type { WorkspaceTurnRuntime } from "./stage-runtime";
import type {
  AttemptTiming,
  WorkspaceAiEducationOutput,
  WorkspaceAiEvaluationOutput,
  WorkspaceAiMessage,
  WorkspaceAiRecallOutput,
  WorkspaceAiState,
  WorkspaceAiTurnResult,
} from "./types";
import type {
  ResolvedWorkspaceTurn,
  WorkspaceTurnDependencies,
} from "./workspace-turn";
import type { WorkspaceTurnPersistenceDependencies } from "./workspace-turn-persistence";
import { buildWorkspaceContextEnvelope } from "../context-engine/build-context-envelope";
import { renderWorkspaceStageContextPrompt } from "../context-engine/render-context-prompt";
import { compactTranscript, createSummarizer } from "../engine/compaction";
import { getAiModelForPurpose } from "../engine/model-router";
import { clampClaimedItemRating } from "../orchestration/goldilocks";
import { buildWorkspaceIntroMessage } from "../workflows/get-ai-workspace-workflow";
import {
  buildLegacyScenarioEvaluationContract,
  validateEvaluationDimensionResults,
} from "./evaluation-contracts";
import {
  hasFailedEvaluationAttempt,
  normalizeEvaluationPlan,
  selectLatestEvaluationPlan,
} from "./evaluation-plan";
import { selectWorkspaceTurnRuntime } from "./stage-runtime";
import {
  getWorkspaceMessageSlot,
  resolveWorkspaceTurn,
} from "./workspace-turn";
import {
  saveEducationTurnResult,
  saveNextScenarioPrompt,
  saveRecallTurnResult,
} from "./workspace-turn-persistence";

export type WorkspaceChatAction =
  | "submit_answer"
  | "next_scenario"
  | "adjust_difficulty";

export type ManualDifficultySignal = "too_easy" | "too_hard";

interface DifficultyDirectiveResult {
  directive: {
    reason: string;
    targetItemRating: number;
  };
  promptBlock: string;
  ratingSnapshot: string;
}

interface ManualDifficultyNudgeResult {
  delta: number;
  previousRating: number;
  nextRating: number;
}

interface OpenScenarioResult {
  scenarioPrompt?: string | null;
  scenarioContractJson?: ScenarioEvaluationContract | null;
  itemRating?: number | null;
}

export interface WorkspaceTurnOrchestrationDependencies
  extends WorkspaceTurnDependencies,
    WorkspaceTurnPersistenceDependencies {
  getWorkspaceSummary: (
    sessionId: string,
    slot: "education_unit" | "recall",
  ) => Promise<{
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  } | null>;
  upsertWorkspaceSummary: (input: {
    sessionId: string;
    slot: "education_unit" | "recall";
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  }) => Promise<void>;
  listMemories: (userId: string) => Promise<Memory[]>;
  prepareDifficultyDirective?: (input: {
    userId: string;
    nodeId: string;
    now: Date;
    bands?: readonly DifficultyBand[] | null;
  }) => Promise<DifficultyDirectiveResult>;
  applyManualDifficultyNudge?: (input: {
    userId: string;
    nodeId: string;
    signal: ManualDifficultySignal;
    now: Date;
  }) => Promise<ManualDifficultyNudgeResult>;
  getOpenScenario?: (input: {
    userId: string;
    nodeId: string;
  }) => Promise<OpenScenarioResult | null>;
  updateOpenScenarioItemRating?: (input: {
    userId: string;
    nodeId: string;
    itemRating: number;
  }) => Promise<unknown>;
  recordEvaluation?: (input: {
    userId: string;
    nodeId: string;
    score: number | null | undefined;
    errorCodes: readonly string[];
    wasOverTime: boolean;
    occurredAt: Date;
    bands?: readonly DifficultyBand[] | null;
  }) => Promise<{ mastered: boolean }>;
  prewarmWorkspaceUnit?: (node: CurriculumNode) => Promise<unknown>;
}

export interface PreparedWorkspaceTurn {
  kind: "prepared";
  action: WorkspaceChatAction;
  manualDifficultySignal: ManualDifficultySignal | null;
  sessionId: string;
  userId: string;
  turnId: string | null;
  message: string;
  attemptTiming?: AttemptTiming | null;
  turn: ResolvedWorkspaceTurn;
  runtime: WorkspaceTurnRuntime;
  promptContext: string;
  scenarioEvaluationContract: ScenarioEvaluationContract | null;
  difficultyDirectiveResult: DifficultyDirectiveResult | null;
  manualDifficultyNudge: ManualDifficultyNudgeResult | null;
}

export interface CachedWorkspaceTurn {
  kind: "cached";
  assistantMessage: WorkspaceAiMessage;
  messages: WorkspaceAiMessage[];
}

export type PreparedWorkspaceTurnResult =
  | PreparedWorkspaceTurn
  | CachedWorkspaceTurn;

export type WorkspaceTurnOutput =
  | WorkspaceAiRecallOutput
  | WorkspaceAiEducationOutput
  | WorkspaceAiEvaluationOutput;

const SCENARIO_EDUCATION_STAGES = new Set<string>([
  "diagnostic_scenario",
  "guided_application",
  "performance_evaluation",
  "transfer_scenario",
]);

export const isEvaluationOutput = (
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput,
): output is WorkspaceAiEvaluationOutput => "routingDecision" in output;

const shouldPrepareDifficultyDirective = ({
  state,
  action,
  runtimeContextMode,
}: {
  state: WorkspaceAiState;
  action: WorkspaceChatAction;
  runtimeContextMode: WorkspaceTurnRuntime["contextMode"];
}) => {
  if (state.mode === "recall") return true;
  if (action === "next_scenario" || action === "adjust_difficulty") return true;
  if (runtimeContextMode === "evaluator") return false;
  return state.educationStage
    ? SCENARIO_EDUCATION_STAGES.has(state.educationStage)
    : false;
};

const buildActionPromptContext = ({
  context,
  action,
  manualDifficultySignal,
  manualDifficultyNudge,
}: {
  context: string;
  action: WorkspaceChatAction;
  manualDifficultySignal: ManualDifficultySignal | null;
  manualDifficultyNudge: ManualDifficultyNudgeResult | null;
}) => {
  if (action === "next_scenario") {
    return `${context}\n\n## Turn instruction\nThe learner clicked Next scenario after reading evaluator feedback. Generate the next planned evaluation scenario only. Do not treat this as a learner answer. Do not re-grade the previous answer. Keep the current evaluation stage active unless this prompt is impossible.`;
  }

  if (action === "adjust_difficulty") {
    return `${context}\n\n## Turn instruction\nThe learner marked the previous scenario as ${manualDifficultySignal === "too_hard" ? "too hard" : "too easy"}. Do not treat this as a learner answer. Do not grade or discuss their ability. Generate a replacement scenario only. The training engine has already adjusted the learner rating by ${manualDifficultyNudge?.delta ?? 0} points, from ${Math.round(manualDifficultyNudge?.previousRating ?? 0)} to ${Math.round(manualDifficultyNudge?.nextRating ?? 0)}. Make the replacement meaningfully ${manualDifficultySignal === "too_hard" ? "more approachable" : "more challenging"} while following the difficulty directive exactly. It should feel just above the learner's current level, not the same scenario with different wording.`;
  }

  return context;
};

const getTurnClaimContent = ({
  action,
  manualDifficultySignal,
  message,
}: {
  action: WorkspaceChatAction;
  manualDifficultySignal: ManualDifficultySignal | null;
  message: string;
}) => {
  if (action === "next_scenario") {
    return "[next_scenario_requested]";
  }

  if (action === "adjust_difficulty") {
    return `[difficulty_adjustment:${manualDifficultySignal ?? "unknown"}]`;
  }

  return message;
};

export const prepareWorkspaceTurnPrompt = async ({
  sessionId,
  userId,
  turnId = null,
  message,
  attemptTiming,
  action = "submit_answer",
  manualDifficultySignal = null,
  deps,
}: {
  sessionId: string;
  userId: string;
  turnId?: string | null;
  message: string;
  attemptTiming?: AttemptTiming | null;
  action?: WorkspaceChatAction;
  manualDifficultySignal?: ManualDifficultySignal | null;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Promise<PreparedWorkspaceTurnResult> => {
  const trimmedMessage = message.trim();
  if (action === "submit_answer" && trimmedMessage.length < 2) {
    throw new Error("Write a fuller message so the AI can respond usefully.");
  }

  if (turnId && !deps.claimWorkspaceTurn && deps.listMessagesByTurnId) {
    const turnMessages = await deps.listMessagesByTurnId(sessionId, turnId);
    const cachedAssistantMessage = turnMessages.find(
      (workspaceMessage) => workspaceMessage.role === "assistant",
    );
    if (cachedAssistantMessage) {
      const cachedSlot =
        cachedAssistantMessage.slot === "recall" ? "recall" : "education_unit";

      return {
        kind: "cached",
        assistantMessage: cachedAssistantMessage,
        messages: await deps.listMessages(sessionId, cachedSlot),
      };
    }

    if (
      action === "submit_answer" &&
      turnMessages.some((workspaceMessage) => workspaceMessage.role === "user")
    ) {
      throw new Error("This turn is already being processed.");
    }
  }

  const turn = await resolveWorkspaceTurn({ sessionId, deps });
  const { plan, allResponses, state, node, unit, unitResponses } = turn;
  const slot = getWorkspaceMessageSlot(state.mode);

  if (turnId && deps.claimWorkspaceTurn) {
    const claim = await deps.claimWorkspaceTurn({
      sessionId,
      content: getTurnClaimContent({
        action,
        manualDifficultySignal,
        message: trimmedMessage,
      }),
      slot,
      unitId: unit.nodeId,
      turnId,
      hiddenFromTranscript: action !== "submit_answer",
    });

    if (claim.status === "completed") {
      const cachedSlot =
        claim.assistantMessage.slot === "recall" ? "recall" : "education_unit";

      return {
        kind: "cached",
        assistantMessage: claim.assistantMessage,
        messages: await deps.listMessages(sessionId, cachedSlot),
      };
    }

    if (claim.status === "processing") {
      throw new Error("This turn is already being processed.");
    }
  } else if (action === "submit_answer") {
    const userMessage = await deps.appendMessage({
      sessionId,
      role: "user",
      content: trimmedMessage,
      slot,
      unitId: unit.nodeId,
      turnId,
    });

    if (!userMessage) {
      throw new Error("User message could not be saved.");
    }
  }

  const messagesWithUser = await deps.listMessages(sessionId, slot);
  const storedSummary = await deps.getWorkspaceSummary(sessionId, slot);
  const summarizeModel = getAiModelForPurpose("recall");
  const compaction = summarizeModel
    ? await compactTranscript({
        messages: messagesWithUser,
        previousSummary: storedSummary?.summary ?? null,
        previousCoverage: storedSummary?.coveredThroughUnitId ?? null,
        previousCoverageSequence: storedSummary?.coveredThroughSequence ?? null,
        summarize: createSummarizer(summarizeModel),
      })
    : null;

  if (compaction?.summaryChanged && compaction.summary) {
    await deps.upsertWorkspaceSummary({
      sessionId,
      slot,
      summary: compaction.summary,
      coveredThroughUnitId: compaction.coverage,
      coveredThroughSequence: compaction.coverageSequence,
    });
  }

  const verbatimMessages = compaction?.messages ?? messagesWithUser;
  const progressSummary = compaction?.summary ?? storedSummary?.summary ?? null;
  const introMessage =
    state.mode === "recall" &&
    !messagesWithUser.some(
      (workspaceMessage) => workspaceMessage.role === "assistant",
    )
      ? buildWorkspaceIntroMessage({ plan, state })
      : null;
  const runtime = selectWorkspaceTurnRuntime(state);

  if (
    action === "adjust_difficulty" &&
    runtime.contextMode !== "evaluator" &&
    runtime.contextMode !== "recall"
  ) {
    throw new Error(
      "Difficulty can only be adjusted on evaluation or recall scenarios.",
    );
  }

  const activeEvaluationPlan = selectLatestEvaluationPlan(unitResponses);
  const shouldUseDifficultyDirective =
    deps.prepareDifficultyDirective &&
    shouldPrepareDifficultyDirective({
      state,
      action,
      runtimeContextMode: runtime.contextMode,
    });
  const now = new Date();
  const manualDifficultyNudge =
    action === "adjust_difficulty" &&
    manualDifficultySignal &&
    deps.applyManualDifficultyNudge
      ? await deps.applyManualDifficultyNudge({
          userId,
          nodeId: unit.nodeId,
          signal: manualDifficultySignal,
          now,
        })
      : null;
  const [memories, difficultyDirectiveResult] = await Promise.all([
    deps.listMemories(userId),
    shouldUseDifficultyDirective
      ? deps.prepareDifficultyDirective?.({
          userId,
          nodeId: unit.nodeId,
          now,
          bands: unit.difficultyBands,
        })
      : Promise.resolve(null),
  ]);
  const openScenario =
    runtime.contextMode === "evaluator" && deps.getOpenScenario
      ? await deps.getOpenScenario({
          userId,
          nodeId: unit.nodeId,
        })
      : null;
  const scenarioEvaluationContract =
    runtime.contextMode === "evaluator"
      ? (openScenario?.scenarioContractJson ??
        buildLegacyScenarioEvaluationContract({
          unit,
          stage: state.educationStage ?? "performance_evaluation",
          scenarioPrompt:
            openScenario?.scenarioPrompt ??
            verbatimMessages
              .slice()
              .reverse()
              .find((workspaceMessage) => workspaceMessage.role === "assistant")
              ?.content ??
            unit.seedPrompt,
        }))
      : null;
  const contextEnvelope = buildWorkspaceContextEnvelope({
    plan,
    node,
    unit,
    state,
    messages: verbatimMessages,
    introMessage,
    memories,
    progressSummary,
    activeUnitResponses: unitResponses,
    allResponses,
    runtime,
    evaluationPlan: activeEvaluationPlan,
    attemptTiming,
    scenarioEvaluationContract,
    difficultyDirective: difficultyDirectiveResult
      ? {
          reason: difficultyDirectiveResult.directive.reason,
          promptBlock: difficultyDirectiveResult.promptBlock,
        }
      : null,
    ratingSnapshot: difficultyDirectiveResult?.ratingSnapshot ?? null,
  });
  const context = renderWorkspaceStageContextPrompt({
    envelope: contextEnvelope,
    runtime,
  });

  return {
    kind: "prepared",
    action,
    manualDifficultySignal,
    sessionId,
    userId,
    turnId,
    message: trimmedMessage,
    attemptTiming,
    turn,
    runtime,
    promptContext: buildActionPromptContext({
      context,
      action,
      manualDifficultySignal,
      manualDifficultyNudge,
    }),
    scenarioEvaluationContract,
    difficultyDirectiveResult: difficultyDirectiveResult ?? null,
    manualDifficultyNudge,
  };
};

export const parseWorkspaceTurnOutput = ({
  runtime,
  rawOutput,
}: {
  runtime: WorkspaceTurnRuntime;
  rawOutput: unknown;
}): WorkspaceTurnOutput =>
  runtime.outputSchema.parse(rawOutput) as WorkspaceTurnOutput;

const getPriorEvaluationAttempts = (unitResponses: PhaseResponseRecord[]) =>
  unitResponses.filter(
    (response) =>
      response.phase === "ai_education" &&
      response.metadata?.promptKind === "evaluate_feedback" &&
      response.metadata.nextScenarioPrompt !== true,
  ).length;

const maybeUpdateOpenScenarioItemRating = async ({
  prepared,
  output,
  deps,
}: {
  prepared: PreparedWorkspaceTurn;
  output: WorkspaceTurnOutput;
  deps: WorkspaceTurnOrchestrationDependencies;
}) => {
  if (
    !prepared.difficultyDirectiveResult ||
    !deps.updateOpenScenarioItemRating
  ) {
    return;
  }

  await deps.updateOpenScenarioItemRating({
    userId: prepared.userId,
    nodeId: prepared.turn.unit.nodeId,
    itemRating: clampClaimedItemRating({
      claimed: output.estimatedItemRating,
      target: prepared.difficultyDirectiveResult.directive.targetItemRating,
    }),
  });
};

export const completeWorkspaceTurn = async ({
  prepared,
  rawOutput,
  deps,
}: {
  prepared: PreparedWorkspaceTurn;
  rawOutput: unknown;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Promise<WorkspaceAiTurnResult | null> => {
  const output = parseWorkspaceTurnOutput({
    runtime: prepared.runtime,
    rawOutput,
  });
  const { action, turn } = prepared;
  const { state, unit, plan, unitResponses } = turn;

  if (state.mode === "recall") {
    await maybeUpdateOpenScenarioItemRating({ prepared, output, deps });

    if (action === "adjust_difficulty") {
      return saveRecallTurnResult({
        sessionId: prepared.sessionId,
        userId: prepared.userId,
        message: `[difficulty_adjustment:${prepared.manualDifficultySignal}]`,
        state,
        unit,
        plan,
        output: {
          ...(output as WorkspaceAiRecallOutput),
          recallComplete: false,
          score: null,
        },
        difficultyDirectiveReason:
          prepared.difficultyDirectiveResult?.directive.reason ?? null,
        manualDifficultySignal: prepared.manualDifficultySignal,
        turnId: prepared.turnId,
        deps,
      });
    }

    return saveRecallTurnResult({
      sessionId: prepared.sessionId,
      userId: prepared.userId,
      message: prepared.message,
      state,
      unit,
      plan,
      output: output as WorkspaceAiRecallOutput,
      difficultyDirectiveReason:
        prepared.difficultyDirectiveResult?.directive.reason ?? null,
      deps,
      turnId: prepared.turnId,
    });
  }

  if (!state.educationStage) {
    throw new Error("Education stage is missing.");
  }

  const educationOutput = output as
    | WorkspaceAiEducationOutput
    | WorkspaceAiEvaluationOutput;
  const evaluationPlan = isEvaluationOutput(educationOutput)
    ? normalizeEvaluationPlan({
        plan: educationOutput.evaluationPlan,
        isRetryAfterFailure: hasFailedEvaluationAttempt(unitResponses),
      })
    : null;

  if (
    isEvaluationOutput(educationOutput) &&
    prepared.scenarioEvaluationContract
  ) {
    validateEvaluationDimensionResults({
      scenarioContract: prepared.scenarioEvaluationContract,
      dimensionIds: educationOutput.dimensionResults.map(
        (dimensionResult) => dimensionResult.dimensionId,
      ),
    });
  }

  await maybeUpdateOpenScenarioItemRating({
    prepared,
    output: educationOutput,
    deps,
  });

  if (action === "next_scenario" || action === "adjust_difficulty") {
    await saveNextScenarioPrompt({
      sessionId: prepared.sessionId,
      userId: prepared.userId,
      unit,
      output: educationOutput,
      evaluationPlan,
      currentStage: state.educationStage,
      difficultyDirectiveReason:
        prepared.difficultyDirectiveResult?.directive.reason ?? null,
      manualDifficultySignal:
        action === "adjust_difficulty" ? prepared.manualDifficultySignal : null,
      turnId: prepared.turnId,
      deps,
    });

    return null;
  }

  const result = await saveEducationTurnResult({
    sessionId: prepared.sessionId,
    userId: prepared.userId,
    message: prepared.message,
    state,
    unit,
    plan,
    output: educationOutput,
    attemptTiming: prepared.attemptTiming,
    evaluationPlan,
    priorEvaluationAttempts: getPriorEvaluationAttempts(unitResponses),
    difficultyDirectiveReason:
      prepared.difficultyDirectiveResult?.directive.reason ?? null,
    turnId: prepared.turnId,
    deps,
  });

  if (result.nextReadyNode && deps.prewarmWorkspaceUnit) {
    try {
      await deps.prewarmWorkspaceUnit(result.nextReadyNode);
    } catch (error) {
      console.error("Next workspace unit prewarm failed", {
        nodeId: result.nextReadyNode.id,
        error,
      });
    }
  }

  return result;
};
