import type { ModelMessage } from "ai";
import type { Layer, Scope } from "effect";
import { Effect, Exit } from "effect";

import type { Memory } from "../../memory/types";
import type { UnitDifficultySnapshot } from "../education-unit/unit";
import type { ScenarioDirective } from "../engine/rating";
import type { DifficultyBand } from "../types/training.types";
import type { WorkspaceTurnRuntime } from "./stage-runtime";
import type {
  AttemptTiming,
  WorkspaceAiMessage,
  WorkspaceAiRecallOutput,
  WorkspaceAiTurnResult,
} from "./types";
import type { WorkspaceEducationTurnError } from "./workspace-errors";
import type {
  ResolvedWorkspaceTurn,
  WorkspaceTurnDependencies,
} from "./workspace-turn";
import type {
  WorkspaceRatingEvaluationCommit,
  WorkspaceTurnPersistenceDependencies,
} from "./workspace-turn-persistence";
import type { WorkspaceTurnRepo } from "./workspace-turn-repo";
import { buildWorkspaceContextEnvelope } from "../context-engine/build-context-envelope";
import { renderWorkspaceStageContextPrompt } from "../context-engine/render-context-prompt";
import { buildUnitTurnContext } from "../education-unit/context";
import { runUnitTurn } from "../education-unit/orchestrate-unit-turn";
import { getUnitRecipe } from "../education-unit/unit";
import { compactTranscript, createSummarizer } from "../engine/compaction";
import { getAiModelForPurpose } from "../engine/model-router";
import { resolveRatingScope } from "../orchestration/rating-scope";
import { buildWorkspaceIntroMessage } from "../workflows/get-ai-workspace-workflow";
import { deriveServerAttemptTiming } from "./evaluation-plan";
import { runWorkspaceAiPrompt } from "./runtime";
import { getStepCard } from "./stage-runtime";
import {
  RatingEvidenceError,
  TurnLeaseConflictError,
  TurnLeaseMissingError,
  WorkspaceInputError,
  WorkspacePersistenceError,
} from "./workspace-errors";
import {
  isUnitAwaitingAdvance,
  planNextWorkspaceTurn,
  resolveWorkspaceTurn,
} from "./workspace-turn";
import { runWorkspaceTurn } from "./workspace-turn-edge";
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
  directive: ScenarioDirective;
  promptBlock: string;
  ratingSnapshot: string;
  learnerRating: number;
}

type ResolvedDifficultyDirectiveResult = Omit<
  DifficultyDirectiveResult,
  "scenarioAttemptId"
>;

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
  solvePresentedAt?: Date | null;
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
  getUnitSyllabusContext?: (unitNodeId: string) => Promise<{
    clusterNodeId: string;
    workflow: { name: string; steps: string[] };
    checked: { label: string; gloss: string }[];
    targets: { id: string; label: string; gloss: string }[];
  } | null>;
  prepareDifficultyDirective?: (input: {
    userId: string;
    nodeId: string;
    now: Date;
    bands?: readonly DifficultyBand[] | null;
  }) => Promise<DifficultyDirectiveResult>;
  resolveDifficultyDirective: (input: {
    userId: string;
    nodeId: string;
    now: Date;
    bands?: readonly DifficultyBand[] | null;
  }) => Promise<ResolvedDifficultyDirectiveResult>;
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

const persistPromise = <A>(
  operation: string,
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, WorkspacePersistenceError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) =>
      new WorkspacePersistenceError({
        message: "Workspace data could not be saved or loaded.",
        operation,
        cause,
      }),
  });

const ratingPromise = <A>(
  operation: string,
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, RatingEvidenceError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) =>
      new RatingEvidenceError({
        message: "Rating evidence could not be loaded.",
        operation,
        cause,
      }),
  });

const releaseClaimedTurn = ({
  sessionId,
  turnId,
  turnLeaseId,
  deps,
}: {
  sessionId: string;
  turnId: string | null;
  turnLeaseId: string | null;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Effect.Effect<void> => {
  const markWorkspaceTurnFailed = deps.markWorkspaceTurnFailed;
  if (!turnId || !turnLeaseId || !markWorkspaceTurnFailed) return Effect.void;

  return Effect.tryPromise(() =>
    markWorkspaceTurnFailed({
      sessionId,
      turnId,
      leaseId: turnLeaseId,
      reason: "Education turn ended before its atomic commit completed.",
    }),
  ).pipe(
    Effect.catch((cause) =>
      Effect.logError("Failed to release an education turn lease.", {
        cause,
        sessionId,
        turnId,
      }),
    ),
  );
};

const claimTurnAndLoadTranscript = ({
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
}): Effect.Effect<
  LoadedTurnTranscript,
  TurnLeaseMissingError | TurnLeaseConflictError | WorkspacePersistenceError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    let claimedDurableTurn = false;

    const claimWorkspaceTurn = deps.claimWorkspaceTurn;
    if (turnId && claimWorkspaceTurn) {
      if (!turnLeaseId) {
        return yield* new TurnLeaseMissingError({
          message: "Workspace turn lease could not be created.",
        });
      }
      const claim = yield* persistPromise("claimWorkspaceTurn", () =>
        claimWorkspaceTurn({
          sessionId,
          action,
          content: claimContent,
          slot,
          unitId,
          turnId,
          leaseId: turnLeaseId,
        }),
      );

      if (claim.status === "completed") {
        return {
          kind: "cached",
          assistantMessage: claim.assistantMessage,
          messages: yield* persistPromise("listWorkspaceMessages", () =>
            deps.listMessages(sessionId, slot),
          ),
        };
      }
      if (claim.status === "processing") {
        return yield* new TurnLeaseConflictError({
          message: "This turn is already being processed.",
        });
      }
      claimedDurableTurn = true;
      if (slot === "education_unit") {
        yield* Effect.addFinalizer((exit) =>
          Exit.isFailure(exit)
            ? releaseClaimedTurn({ sessionId, turnId, turnLeaseId, deps })
            : Effect.void,
        );
      }
    } else if (appendSyntheticUserMessage) {
      const userMessage = yield* persistPromise("appendWorkspaceMessage", () =>
        deps.appendMessage({
          sessionId,
          role: "user",
          content: message,
          slot,
          unitId,
          turnId,
        }),
      );
      if (!userMessage) {
        return yield* new WorkspacePersistenceError({
          message: "User message could not be saved.",
          operation: "appendWorkspaceMessage",
        });
      }
    }

    const [persistedMessages, storedSummary] = yield* Effect.all(
      [
        persistPromise("listWorkspaceMessages", () =>
          deps.listMessages(sessionId, slot),
        ),
        persistPromise("getWorkspaceSummary", () =>
          deps.getWorkspaceSummary(sessionId, slot),
        ),
      ],
      { concurrency: 2 },
    );
    const messages =
      claimedDurableTurn && appendSyntheticUserMessage
        ? [
            ...persistedMessages,
            {
              role: "user" as const,
              content: message,
              sequence:
                Math.max(
                  -1,
                  ...persistedMessages.map((item) => item.sequence),
                ) + 1,
              slot,
              unitId,
              turnId,
              metadata: null,
            },
          ]
        : persistedMessages;
    const summarizeModel = getAiModelForPurpose("recall");
    const compaction = summarizeModel
      ? yield* persistPromise("compactWorkspaceTranscript", () =>
          compactTranscript({
            messages,
            previousSummary: storedSummary?.summary ?? null,
            previousCoverage: storedSummary?.coveredThroughUnitId ?? null,
            previousCoverageSequence:
              storedSummary?.coveredThroughSequence ?? null,
            summarize: createSummarizer(summarizeModel),
          }),
        )
      : null;

    if (compaction?.summaryChanged && compaction.summary) {
      const summary = compaction.summary;
      yield* persistPromise("upsertWorkspaceSummary", () =>
        deps.upsertWorkspaceSummary({
          sessionId,
          slot,
          summary,
          coveredThroughUnitId: compaction.coverage,
          coveredThroughSequence: compaction.coverageSequence,
        }),
      );
    }

    return {
      kind: "claimed",
      messages,
      transcript: compaction?.messages ?? messages,
      progressSummary: compaction?.summary ?? storedSummary?.summary ?? null,
      claimedDurableTurn,
    };
  });

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

export const runEducationUnitTurn = ({
  sessionId,
  userId,
  turnId,
  turnLeaseId,
  message,
  turn,
  deps,
  onAssistantMessage,
}: {
  sessionId: string;
  userId: string;
  turnId: string | null;
  turnLeaseId: string | null;
  message: string;
  turn: ResolvedWorkspaceTurn;
  deps: WorkspaceTurnOrchestrationDependencies;
  onAssistantMessage?: (content: string) => void;
}): Effect.Effect<
  WorkspaceAiTurnResult,
  WorkspaceEducationTurnError,
  WorkspaceTurnRepo
> =>
  Effect.gen(function* () {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 2) {
      return yield* new WorkspaceInputError({
        message: "Write a fuller message so the AI can respond usefully.",
      });
    }

    const { plan, state, node, unit, unitRun, unitResponses } = turn;

    if (isUnitAwaitingAdvance({ node, run: unitRun })) {
      return yield* new WorkspaceInputError({
        message: "This unit is complete. Press Next Unit to continue.",
      });
    }

    const loadedTranscript = yield* claimTurnAndLoadTranscript({
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
      const nextState = yield* persistPromise("planNextWorkspaceTurn", () =>
        planNextWorkspaceTurn({ sessionId, plan, deps }),
      );
      return {
        state: nextState ?? state,
        messages: loadedTranscript.messages,
        assistantMessage: loadedTranscript.assistantMessage,
      };
    }
    const ratingScope = resolveRatingScope({ unit, planNodes: plan.nodes });

    const [memories, resolvedDifficulty] = yield* Effect.all(
      [
        persistPromise("listMemories", () => deps.listMemories(userId)),
        unitRun.difficultySnapshot
          ? Effect.succeed(null)
          : ratingPromise("resolveDifficultyDirective", () =>
              deps.resolveDifficultyDirective({
                userId,
                nodeId: ratingScope.nodeId,
                now: new Date(),
                bands: ratingScope.bands,
              }),
            ),
      ],
      { concurrency: 2 },
    );
    let difficultySnapshot: UnitDifficultySnapshot | null =
      unitRun.difficultySnapshot;
    if (!difficultySnapshot) {
      if (!resolvedDifficulty) {
        return yield* new RatingEvidenceError({
          message: "Goldilocks did not resolve a unit difficulty snapshot.",
        });
      }
      difficultySnapshot = {
        nodeId: ratingScope.nodeId,
        directive: resolvedDifficulty.directive,
        promptBlock: resolvedDifficulty.promptBlock,
        ratingSnapshot: resolvedDifficulty.ratingSnapshot,
        learnerRating: resolvedDifficulty.learnerRating,
      };
    }

    const recipe = getUnitRecipe(unitRun.recipeVersion, ratingScope);
    const getUnitSyllabusContext = deps.getUnitSyllabusContext;
    const syllabus = getUnitSyllabusContext
      ? yield* persistPromise("getUnitSyllabusContext", () =>
          getUnitSyllabusContext(unit.nodeId),
        )
      : null;
    const contextBlock = buildUnitTurnContext({
      unit,
      state: unitRun,
      policy: recipe.policy,
      memories,
      progressSummary: loadedTranscript.progressSummary,
      difficultyLine: difficultySnapshot.promptBlock,
      pendingConnectTeach: readPendingConnectTeach(unitResponses),
      scenarioSpec: unitRun.scenarioSpec,
      syllabus,
    });

    const turnResult = yield* (deps.runUnitTurn ?? runUnitTurn)({
      state: unitRun,
      recipe,
      contextBlock,
      transcript: toModelMessages(loadedTranscript.transcript),
    });
    // Check-offs ride the atomic turn commit (lease-guarded), never the outer
    // connection — a lost lease or failed commit must not leave phantom mastery.
    const syllabusCheckOff =
      turnResult.nextState.phase === "mastered" && syllabus
        ? {
            clusterNodeId: syllabus.clusterNodeId,
            requestedEntryIds: turnResult.syllabusCheckOff?.entryIds ?? [],
            targetedEntryIds: syllabus.targets.map((entry) => entry.id),
            evidenceNodeId: unit.nodeId,
          }
        : null;
    const scenarioAttemptId = [...unitResponses]
      .reverse()
      .find(
        (response) =>
          response.phase === "ai_education" &&
          response.metadata?.scenarioAttemptId,
      )?.metadata?.scenarioAttemptId;

    // The first pass-2 verdict feeds Goldilocks, using the attempt that was
    // atomically opened when the pass-2 Connect scenario was presented.
    let ratingEvaluation: WorkspaceRatingEvaluationCommit | null = null;
    const goldilocksAlreadyUpdated = unitResponses.some(
      (response) => response.metadata?.goldilocksUpdated === true,
    );
    if (turnResult.ratingWrite && !goldilocksAlreadyUpdated) {
      if (!scenarioAttemptId) {
        return yield* new RatingEvidenceError({
          message:
            "Pass-2 evaluation requires the scenario attempt opened at presentation.",
        });
      }
      const now = new Date();
      const getScenarioAttempt = deps.getScenarioAttempt;
      if (!getScenarioAttempt) {
        return yield* new RatingEvidenceError({
          message: "Pass-2 evaluation requires scenario attempt reads.",
        });
      }
      const attempt = yield* ratingPromise("getScenarioAttempt", () =>
        getScenarioAttempt({
          scenarioAttemptId,
          userId,
          nodeId: difficultySnapshot.nodeId,
        }),
      );
      if (!attempt?.solvePresentedAt) {
        return yield* new RatingEvidenceError({
          message:
            "Pass-2 evaluation requires a persisted Solve presentation time.",
        });
      }
      const timing = deriveServerAttemptTiming({
        presentedAt: attempt.solvePresentedAt,
        submittedAt: now,
        timeLimitSeconds: recipe.grade.solveTimeLimitSeconds,
      });
      if (!timing) {
        return yield* new RatingEvidenceError({
          message: "Pass-2 evaluation timing could not be derived.",
        });
      }
      ratingEvaluation = {
        scenarioAttemptId,
        userId,
        nodeId: difficultySnapshot.nodeId,
        score: turnResult.ratingWrite.score,
        errorCodes: turnResult.ratingWrite.errorCodes,
        wasOverTime: timing.wasOverTime,
        occurredAt: now,
        bands: ratingScope.bands,
      };
    }

    const result = yield* saveUnitPhaseResult({
      sessionId,
      userId,
      message: trimmedMessage,
      state,
      unit,
      plan,
      turnResult,
      ratingEvaluation,
      syllabusCheckOff,
      difficultySnapshot,
      scenarioAttemptId: scenarioAttemptId ?? null,
      difficultyDirectiveReason: difficultySnapshot.directive.reason,
      turnId,
      turnLeaseId,
      persistUserMessage: loadedTranscript.claimedDurableTurn,
      phaseResponseSequence: unitResponses.filter(
        (response) => response.phase === "ai_education",
      ).length,
      deps,
    });
    onAssistantMessage?.(result.assistantMessage.content);

    return {
      state: result.state,
      messages: result.messages,
      assistantMessage: result.assistantMessage,
    };
  }).pipe(Effect.scoped);

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
    throw new WorkspaceInputError({
      message: "Write a fuller message so the AI can respond usefully.",
    });
  }

  const { plan, allResponses, state, node, unit, unitResponses } = turn;
  const ratingScope = resolveRatingScope({ unit, planNodes: plan.nodes });
  const loadedTranscript = await Effect.runPromise(
    claimTurnAndLoadTranscript({
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
    }).pipe(Effect.scoped),
  );
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
  workspaceTurnRepoLayer,
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
  workspaceTurnRepoLayer: Layer.Layer<WorkspaceTurnRepo>;
}): Promise<WorkspaceAiTurnResult> => {
  const turn = await resolveWorkspaceTurn({ sessionId, deps });

  if (turn.state.mode === "education_unit") {
    if (action !== "submit_answer") {
      throw new WorkspaceInputError({
        message:
          "Education units only accept answers; there is no next-scenario or difficulty control here.",
      });
    }
    return runWorkspaceTurn(
      runEducationUnitTurn({
        sessionId,
        userId,
        turnId,
        turnLeaseId,
        message,
        turn,
        deps,
      }).pipe(Effect.provide(workspaceTurnRepoLayer)),
    );
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
