import type { ModelMessage } from "ai";

import type { Memory } from "../../memory/types";
import type { CurriculumNode, DifficultyBand } from "../types/training.types";
import type { WorkspaceTurnRuntime } from "./stage-runtime";
import type {
  AttemptTiming,
  WorkspaceAiMessage,
  WorkspaceAiRecallOutput,
  WorkspaceAiTurnResult,
} from "./types";
import type {
  ResolvedWorkspaceTurn,
  WorkspaceTurnDependencies,
} from "./workspace-turn";
import type {
  WorkspaceRatingEvaluationCommit,
  WorkspaceTurnPersistenceDependencies,
} from "./workspace-turn-persistence";
import { buildWorkspaceContextEnvelope } from "../context-engine/build-context-envelope";
import { renderWorkspaceStageContextPrompt } from "../context-engine/render-context-prompt";
import { buildUnitTurnContext } from "../education-unit/context";
import { runUnitTurn } from "../education-unit/orchestrate-unit-turn";
import { getUnitRecipe } from "../education-unit/unit";
import { compactTranscript, createSummarizer } from "../engine/compaction";
import { getAiModelForPurpose } from "../engine/model-router";
import { WorkspaceUserError } from "../errors";
import { clampClaimedItemRating } from "../orchestration/goldilocks";
import { resolveRatingScope } from "../orchestration/rating-scope";
import { buildWorkspaceIntroMessage } from "../workflows/get-ai-workspace-workflow";
import { runWorkspaceAiPrompt } from "./runtime";
import { getStepCard } from "./stage-runtime";
import {
  isUnitAwaitingAdvance,
  planNextWorkspaceTurn,
  resolveWorkspaceTurn,
} from "./workspace-turn";
import {
  saveRecallTurnResult,
  saveUnitPhaseResult,
} from "./workspace-turn-persistence";

export type WorkspaceChatAction =
  | "submit_answer"
  | "next_scenario"
  | "adjust_difficulty";

export type ManualDifficultySignal = "too_easy" | "too_hard";

interface DifficultyDirectiveResult {
  scenarioAttemptId: string;
  directive: {
    reason: string;
    targetItemRating: number;
  };
  promptBlock: string;
  ratingSnapshot: string;
  learnerRating: number;
}

interface ManualDifficultyNudgeResult {
  delta: number;
  previousRating: number;
  nextRating: number;
}

interface OpenScenarioResult {
  id: string;
  scenarioPrompt?: string | null;
  itemRating?: number | null;
  presentedAt?: Date | null;
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
  getScenarioAttempt?: (input: {
    scenarioAttemptId: string;
    userId: string;
    nodeId: string;
  }) => Promise<OpenScenarioResult | null>;
  updateScenarioItemRating?: (input: {
    scenarioAttemptId: string;
    itemRating: number;
  }) => Promise<unknown>;
  prewarmWorkspaceUnit?: (node: CurriculumNode) => Promise<unknown>;
  /** Test seam for deterministic education-unit contract tests. */
  runUnitTurn?: typeof runUnitTurn;
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

const toModelMessages = (
  messages: readonly WorkspaceAiMessage[],
): ModelMessage[] =>
  // WorkspaceAiMessage.role is already exactly "user" | "assistant".
  messages.map((m) => ({ role: m.role, content: m.content }) as ModelMessage);

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

type LoadedTurnTranscript =
  | {
      kind: "cached";
      assistantMessage: WorkspaceAiMessage;
      messages: WorkspaceAiMessage[];
    }
  | {
      kind: "claimed";
      messages: WorkspaceAiMessage[];
      transcript: WorkspaceAiMessage[];
      progressSummary: string | null;
      claimedDurableTurn: boolean;
    };

const claimTurnAndLoadTranscript = async ({
  sessionId,
  slot,
  unitId,
  turnId,
  turnLeaseId,
  action,
  claimContent,
  message,
  appendSyntheticUserMessage,
  deps,
}: {
  sessionId: string;
  slot: "education_unit" | "recall";
  unitId: string;
  turnId: string | null;
  turnLeaseId: string | null;
  action: WorkspaceChatAction;
  claimContent: string;
  message: string;
  appendSyntheticUserMessage: boolean;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Promise<LoadedTurnTranscript> => {
  let claimedDurableTurn = false;

  if (turnId && deps.claimWorkspaceTurn) {
    if (!turnLeaseId) {
      throw new Error("Workspace turn lease could not be created.");
    }
    const claim = await deps.claimWorkspaceTurn({
      sessionId,
      action,
      content: claimContent,
      slot,
      unitId,
      turnId,
      leaseId: turnLeaseId,
    });

    if (claim.status === "completed") {
      return {
        kind: "cached",
        assistantMessage: claim.assistantMessage,
        messages: await deps.listMessages(sessionId, slot),
      };
    }
    if (claim.status === "processing") {
      throw new WorkspaceUserError("This turn is already being processed.");
    }
    claimedDurableTurn = true;
  } else if (appendSyntheticUserMessage) {
    const userMessage = await deps.appendMessage({
      sessionId,
      role: "user",
      content: message,
      slot,
      unitId,
      turnId,
    });
    if (!userMessage) {
      throw new Error("User message could not be saved.");
    }
  }

  const [persistedMessages, storedSummary] = await Promise.all([
    deps.listMessages(sessionId, slot),
    deps.getWorkspaceSummary(sessionId, slot),
  ]);
  const messages =
    claimedDurableTurn && appendSyntheticUserMessage
      ? [
          ...persistedMessages,
          {
            role: "user" as const,
            content: message,
            sequence:
              Math.max(-1, ...persistedMessages.map((item) => item.sequence)) +
              1,
            slot,
            unitId,
            turnId,
            metadata: null,
          },
        ]
      : persistedMessages;
  const summarizeModel = getAiModelForPurpose("recall");
  const compaction = summarizeModel
    ? await compactTranscript({
        messages,
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

  return {
    kind: "claimed",
    messages,
    transcript: compaction?.messages ?? messages,
    progressSummary: compaction?.summary ?? storedSummary?.summary ?? null,
    claimedDurableTurn,
  };
};

// ---------------------------------------------------------------------------
// Education-unit path (v4 FSM)
// ---------------------------------------------------------------------------

/**
 * Reads whether the immediately-prior education turn force-advanced Connect
 * into Solve after exhausting the grill budget. That signal cannot be
 * recovered from the durable state (connectGrills is reset on the transition —
 * see fsm.ts), so it is persisted on the phase-response metadata and read back
 * here to drive the next Solve turn's "teach the missed idea first" directive.
 */
const readPendingConnectTeach = (
  unitResponses: ResolvedWorkspaceTurn["unitResponses"],
): boolean => {
  const lastEducation = [...unitResponses]
    .reverse()
    .find((response) => response.phase === "ai_education");
  return lastEducation?.metadata?.forcedConnectAdvance === true;
};

export const runEducationUnitTurn = async ({
  sessionId,
  userId,
  turnId,
  turnLeaseId,
  message,
  turn,
  deps,
  onAssistantMessage,
  scheduleBackgroundTask,
}: {
  sessionId: string;
  userId: string;
  turnId: string | null;
  turnLeaseId: string | null;
  message: string;
  turn: ResolvedWorkspaceTurn;
  deps: WorkspaceTurnOrchestrationDependencies;
  onAssistantMessage?: (content: string) => void;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}): Promise<WorkspaceAiTurnResult> => {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < 2) {
    throw new WorkspaceUserError(
      "Write a fuller message so the AI can respond usefully.",
    );
  }

  const { plan, state, node, unit, unitRun, unitResponses } = turn;

  if (isUnitAwaitingAdvance({ node, run: unitRun })) {
    throw new WorkspaceUserError(
      "This unit is complete. Press Next Unit to continue.",
    );
  }

  const loadedTranscript = await claimTurnAndLoadTranscript({
    sessionId,
    slot: "education_unit",
    unitId: unit.nodeId,
    turnId,
    turnLeaseId,
    action: "submit_answer",
    claimContent: trimmedMessage,
    message: trimmedMessage,
    appendSyntheticUserMessage: true,
    deps,
  });
  if (loadedTranscript.kind === "cached") {
    onAssistantMessage?.(loadedTranscript.assistantMessage.content);
    const nextState = await planNextWorkspaceTurn({ sessionId, plan, deps });
    return {
      state: nextState ?? state,
      messages: loadedTranscript.messages,
      assistantMessage: loadedTranscript.assistantMessage,
    };
  }
  const memories = await deps.listMemories(userId);
  const ratingScope = resolveRatingScope({ unit, planNodes: plan.nodes });

  const recipe = getUnitRecipe(unitRun.recipeVersion, ratingScope);
  const contextBlock = buildUnitTurnContext({
    unit,
    state: unitRun,
    policy: recipe.policy,
    memories,
    progressSummary: loadedTranscript.progressSummary,
    // Difficulty is currently only WRITTEN on the pass-2 solve (below). A
    // per-turn READ directive can be layered in later without changing the
    // engine contract.
    difficultyLine: null,
    pendingConnectTeach: readPendingConnectTeach(unitResponses),
  });

  const turnResult = await (deps.runUnitTurn ?? runUnitTurn)({
    state: unitRun,
    recipe,
    contextBlock,
    transcript: toModelMessages(loadedTranscript.transcript),
  });
  onAssistantMessage?.(turnResult.assistantMessage);

  // Only a passing pass-2 solve feeds Goldilocks. Open a scenario attempt for
  // the rating node and grade it in the same commit — self-contained, so no
  // dangling open attempts are left across turns.
  let ratingEvaluation: WorkspaceRatingEvaluationCommit | null = null;
  if (turnResult.ratingWrite && deps.prepareDifficultyDirective) {
    const now = new Date();
    const opened = await deps.prepareDifficultyDirective({
      userId,
      nodeId: ratingScope.nodeId,
      now,
      bands: ratingScope.bands,
    });
    if (deps.updateScenarioItemRating) {
      // The current FSM does not yet generate Solve from this directive. Grade
      // conservatively at the learner's actual pre-turn rating, not at an
      // unpresented target difficulty.
      await deps.updateScenarioItemRating({
        scenarioAttemptId: opened.scenarioAttemptId,
        itemRating: opened.learnerRating,
      });
    }
    ratingEvaluation = {
      scenarioAttemptId: opened.scenarioAttemptId,
      userId,
      nodeId: ratingScope.nodeId,
      score: turnResult.ratingWrite.score,
      errorCodes: [],
      wasOverTime: false,
      occurredAt: now,
      bands: ratingScope.bands,
    };
  }

  const result = await saveUnitPhaseResult({
    sessionId,
    userId,
    message: trimmedMessage,
    state,
    unit,
    plan,
    turnResult,
    ratingEvaluation,
    turnId,
    turnLeaseId,
    persistUserMessage: loadedTranscript.claimedDurableTurn,
    phaseResponseSequence: unitResponses.filter(
      (response) => response.phase === "ai_education",
    ).length,
    deps,
  });

  if (result.nextReadyNode && deps.prewarmWorkspaceUnit) {
    const nextReadyNode = result.nextReadyNode;
    const prewarm = async () => {
      try {
        await deps.prewarmWorkspaceUnit?.(nextReadyNode);
      } catch (error) {
        console.error("Next workspace unit prewarm failed", {
          nodeId: nextReadyNode.id,
          error,
        });
      }
    };
    if (scheduleBackgroundTask) {
      scheduleBackgroundTask(prewarm);
    } else {
      void prewarm();
    }
  }

  return {
    state: result.state,
    messages: result.messages,
    assistantMessage: result.assistantMessage,
  };
};

// ---------------------------------------------------------------------------
// Recall path
// ---------------------------------------------------------------------------

export interface PreparedRecallTurn {
  kind: "prepared";
  action: WorkspaceChatAction;
  manualDifficultySignal: ManualDifficultySignal | null;
  sessionId: string;
  userId: string;
  turnId: string | null;
  turnLeaseId: string | null;
  message: string;
  turn: ResolvedWorkspaceTurn;
  runtime: WorkspaceTurnRuntime;
  promptContext: string;
  difficultyDirectiveResult: DifficultyDirectiveResult | null;
  manualDifficultyNudge: ManualDifficultyNudgeResult | null;
  persistUserMessage: boolean;
  phaseResponseSequence: number;
}

export interface CachedWorkspaceTurn {
  kind: "cached";
  assistantMessage: WorkspaceAiMessage;
  messages: WorkspaceAiMessage[];
}

const buildRecallActionPromptContext = ({
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
    return `${context}\n\n## Turn instruction\nThe learner clicked Next scenario. Generate the next recall scenario only. Do not treat this as a learner answer.`;
  }
  if (action === "adjust_difficulty") {
    return `${context}\n\n## Turn instruction\nThe learner marked the previous scenario as ${manualDifficultySignal === "too_hard" ? "too hard" : "too easy"}. Generate a replacement scenario only. The training engine already adjusted the learner rating by ${manualDifficultyNudge?.delta ?? 0} points, from ${Math.round(manualDifficultyNudge?.previousRating ?? 0)} to ${Math.round(manualDifficultyNudge?.nextRating ?? 0)}. Make it meaningfully ${manualDifficultySignal === "too_hard" ? "more approachable" : "more challenging"}.`;
  }
  return context;
};

export const prepareRecallTurnPrompt = async ({
  sessionId,
  userId,
  turnId,
  turnLeaseId,
  message,
  action,
  manualDifficultySignal,
  turn,
  deps,
}: {
  sessionId: string;
  userId: string;
  turnId: string | null;
  turnLeaseId: string | null;
  message: string;
  action: WorkspaceChatAction;
  manualDifficultySignal: ManualDifficultySignal | null;
  turn: ResolvedWorkspaceTurn;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Promise<PreparedRecallTurn | CachedWorkspaceTurn> => {
  const trimmedMessage = message.trim();
  if (action === "submit_answer" && trimmedMessage.length < 2) {
    throw new WorkspaceUserError(
      "Write a fuller message so the AI can respond usefully.",
    );
  }

  const { plan, allResponses, state, node, unit, unitResponses } = turn;
  const ratingScope = resolveRatingScope({ unit, planNodes: plan.nodes });
  const loadedTranscript = await claimTurnAndLoadTranscript({
    sessionId,
    slot: "recall",
    unitId: unit.nodeId,
    turnId,
    turnLeaseId,
    action,
    claimContent: getTurnClaimContent({
      action,
      manualDifficultySignal,
      message: trimmedMessage,
    }),
    message: trimmedMessage,
    appendSyntheticUserMessage: action === "submit_answer",
    deps,
  });
  if (loadedTranscript.kind === "cached") {
    return loadedTranscript;
  }
  const memoriesPromise = deps.listMemories(userId);

  const messagesWithUser = loadedTranscript.messages;
  const verbatimMessages = loadedTranscript.transcript;
  const progressSummary = loadedTranscript.progressSummary;
  const introMessage = !messagesWithUser.some(
    (workspaceMessage) => workspaceMessage.role === "assistant",
  )
    ? buildWorkspaceIntroMessage({ plan, state })
    : null;
  const runtime = getStepCard(state);

  const now = new Date();
  const manualDifficultyNudge =
    action === "adjust_difficulty" &&
    manualDifficultySignal &&
    deps.applyManualDifficultyNudge
      ? await deps.applyManualDifficultyNudge({
          userId,
          nodeId: ratingScope.nodeId,
          signal: manualDifficultySignal,
          now,
        })
      : null;
  // A manual nudge must land before the directive reads rating state. Memories
  // are independent and were started above, so they still overlap this chain.
  const [difficultyDirectiveResult, memories] = await Promise.all([
    deps.prepareDifficultyDirective
      ? deps.prepareDifficultyDirective({
          userId,
          nodeId: ratingScope.nodeId,
          now,
          bands: ratingScope.bands,
        })
      : null,
    memoriesPromise,
  ]);

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
    evaluationPlan: null,
    attemptTiming: null,
    scenarioEvaluationContract: null,
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
    turnLeaseId,
    message: trimmedMessage,
    turn,
    runtime,
    promptContext: buildRecallActionPromptContext({
      context,
      action,
      manualDifficultySignal,
      manualDifficultyNudge,
    }),
    difficultyDirectiveResult,
    manualDifficultyNudge,
    persistUserMessage:
      loadedTranscript.claimedDurableTurn && action === "submit_answer",
    phaseResponseSequence: unitResponses.filter(
      (response) => response.phase === "ai_recall",
    ).length,
  };
};

const maybeUpdateOpenScenarioItemRating = async ({
  prepared,
  output,
  deps,
}: {
  prepared: PreparedRecallTurn;
  output: WorkspaceAiRecallOutput;
  deps: WorkspaceTurnOrchestrationDependencies;
}) => {
  if (
    !prepared.difficultyDirectiveResult ||
    !deps.updateScenarioItemRating ||
    output.estimatedItemRating == null
  ) {
    return;
  }

  await deps.updateScenarioItemRating({
    scenarioAttemptId: prepared.difficultyDirectiveResult.scenarioAttemptId,
    itemRating: clampClaimedItemRating({
      claimed: output.estimatedItemRating,
      target: prepared.difficultyDirectiveResult.directive.targetItemRating,
    }),
  });
};

export const saveRecallStepResult = async ({
  prepared,
  rawOutput,
  deps,
}: {
  prepared: PreparedRecallTurn;
  rawOutput: unknown;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Promise<WorkspaceAiTurnResult> => {
  const output = prepared.runtime.outputSchema.parse(
    rawOutput,
  ) as WorkspaceAiRecallOutput;
  const { turn } = prepared;
  const { state, unit, plan } = turn;

  await maybeUpdateOpenScenarioItemRating({ prepared, output, deps });

  if (prepared.action === "adjust_difficulty") {
    return saveRecallTurnResult({
      sessionId: prepared.sessionId,
      userId: prepared.userId,
      message: `[difficulty_adjustment:${prepared.manualDifficultySignal}]`,
      state,
      unit,
      plan,
      output: { ...output, recallComplete: false, score: null },
      difficultyDirectiveReason:
        prepared.difficultyDirectiveResult?.directive.reason ?? null,
      manualDifficultySignal: prepared.manualDifficultySignal,
      turnId: prepared.turnId,
      turnLeaseId: prepared.turnLeaseId,
      persistUserMessage: prepared.persistUserMessage,
      phaseResponseSequence: prepared.phaseResponseSequence,
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
    output,
    difficultyDirectiveReason:
      prepared.difficultyDirectiveResult?.directive.reason ?? null,
    turnId: prepared.turnId,
    turnLeaseId: prepared.turnLeaseId,
    persistUserMessage: prepared.persistUserMessage,
    phaseResponseSequence: prepared.phaseResponseSequence,
    deps,
  });
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const runOneStep = async ({
  sessionId,
  userId,
  turnId = null,
  turnLeaseId = null,
  message,
  attemptTiming: _attemptTiming,
  action = "submit_answer",
  manualDifficultySignal = null,
  deps,
}: {
  sessionId: string;
  userId: string;
  turnId?: string | null;
  turnLeaseId?: string | null;
  message: string;
  attemptTiming?: AttemptTiming | null;
  action?: WorkspaceChatAction;
  manualDifficultySignal?: ManualDifficultySignal | null;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Promise<WorkspaceAiTurnResult> => {
  const turn = await resolveWorkspaceTurn({ sessionId, deps });

  if (turn.state.mode === "education_unit") {
    if (action !== "submit_answer") {
      throw new Error(
        "Education units only accept answers; there is no next-scenario or difficulty control here.",
      );
    }
    return runEducationUnitTurn({
      sessionId,
      userId,
      turnId,
      turnLeaseId,
      message,
      turn,
      deps,
    });
  }

  const prepared = await prepareRecallTurnPrompt({
    sessionId,
    userId,
    turnId,
    turnLeaseId,
    message,
    action,
    manualDifficultySignal,
    turn,
    deps,
  });

  if (prepared.kind === "cached") {
    const nextState = await planNextWorkspaceTurn({
      sessionId,
      plan: turn.plan,
      deps,
    });
    return {
      state: nextState ?? turn.state,
      messages: prepared.messages,
      assistantMessage: prepared.assistantMessage,
    };
  }

  const output = await runWorkspaceAiPrompt({
    kind: "recall",
    schema: prepared.runtime.outputSchema,
    errorMessage: "Failed to run recall.",
    context: prepared.promptContext,
  });

  return saveRecallStepResult({ prepared, rawOutput: output, deps });
};
