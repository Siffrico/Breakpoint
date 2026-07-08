import type { ModelMessage } from "ai";
import type { Layer, Scope } from "effect";
import { Effect, Exit } from "effect";

import type { Memory } from "../../memory/types";
import type { UnitDifficultySnapshot } from "../education-unit/unit";
import type { ScenarioDirective } from "../engine/rating";
import type { DifficultyBand } from "../types/training.types";
import type { WorkspaceAiMessage, WorkspaceAiTurnResult } from "./types";
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
import { buildUnitTurnContext } from "../education-unit/context";
import { runUnitTurn } from "../education-unit/orchestrate-unit-turn";
import { getUnitRecipe } from "../education-unit/unit";
import { boundTranscript } from "../engine/compaction";
import { resolveRatingScope } from "../orchestration/rating-scope";
import { deriveServerAttemptTiming } from "./evaluation-plan";
import {
  RatingEvidenceError,
  TurnLeaseConflictError,
  WorkspaceInputError,
  WorkspacePersistenceError,
} from "./workspace-errors";
import {
  isUnitAwaitingAdvance,
  planNextWorkspaceTurn,
  resolveWorkspaceTurn,
} from "./workspace-turn";
import { runWorkspaceTurn } from "./workspace-turn-edge";
import { saveUnitPhaseResult } from "./workspace-turn-persistence";

interface ResolvedDifficultyDirectiveResult {
  directive: ScenarioDirective;
  promptBlock: string;
  ratingSnapshot: string;
  learnerRating: number;
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
  listMemories: (userId: string) => Promise<Memory[]>;
  getUnitSyllabusContext?: (unitNodeId: string) => Promise<{
    clusterNodeId: string;
    workflow: { name: string; steps: string[] };
    checked: { label: string; gloss: string }[];
    targets: { id: string; label: string; gloss: string }[];
  } | null>;
  resolveDifficultyDirective: (input: {
    userId: string;
    nodeId: string;
    now: Date;
    bands?: readonly DifficultyBand[] | null;
  }) => Promise<ResolvedDifficultyDirectiveResult>;
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
  turnId: string;
  turnLeaseId: string;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Effect.Effect<void> => {
  return Effect.tryPromise(() =>
    deps.markWorkspaceTurnFailed({
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
  message,
  appendSyntheticUserMessage,
  deps,
}: {
  sessionId: string;
  slot: "education_unit" | "recall";
  unitId: string;
  turnId: string;
  turnLeaseId: string;
  message: string;
  appendSyntheticUserMessage: boolean;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Effect.Effect<
  LoadedTurnTranscript,
  TurnLeaseConflictError | WorkspacePersistenceError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const claim = yield* persistPromise("claimWorkspaceTurn", () =>
      deps.claimWorkspaceTurn({
        sessionId,
        action: "submit_answer",
        content: message,
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
          deps.listUnitMessages(sessionId, unitId),
        ),
      };
    }
    if (claim.status === "processing") {
      return yield* new TurnLeaseConflictError({
        message: "This turn is already being processed.",
      });
    }
    if (slot === "education_unit") {
      yield* Effect.addFinalizer((exit) =>
        Exit.isFailure(exit)
          ? releaseClaimedTurn({ sessionId, turnId, turnLeaseId, deps })
          : Effect.void,
      );
    }

    // Each unit is its own chat: load only the active unit's transcript. There
    // is no cross-unit rolling summary to fetch or fold — a unit's turn count
    // is bounded by the FSM, so boundTranscript is a pure safety net (clamp one
    // marathon answer), not a summarizer on the hot path.
    const persistedMessages = yield* persistPromise(
      "listWorkspaceMessages",
      () => deps.listUnitMessages(sessionId, unitId),
    );
    const messages = appendSyntheticUserMessage
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

    return {
      kind: "claimed",
      messages,
      transcript: boundTranscript(messages),
      claimedDurableTurn: true,
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
  onPartialAssistantMessage,
}: {
  sessionId: string;
  userId: string;
  turnId: string;
  turnLeaseId: string;
  message: string;
  turn: ResolvedWorkspaceTurn;
  deps: WorkspaceTurnOrchestrationDependencies;
  /** Fires once, with the committed reply. */
  onAssistantMessage?: (content: string) => void;
  /** Speculative model snapshots; a restarted attempt may contradict them. */
  onPartialAssistantMessage?: (content: string) => void;
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
    const recallFocus = turn.recallFocus;
    // Syllabus context depends only on the unit id (recall interludes skip it
    // — they reinforce old entries, never check off new ones), so it loads in
    // parallel with memories and the difficulty directive instead of waiting
    // for them, saving a DB round-trip on every non-recall education turn.
    const getUnitSyllabusContext = deps.getUnitSyllabusContext;
    const loadSyllabus =
      !recallFocus && getUnitSyllabusContext
        ? persistPromise("getUnitSyllabusContext", () =>
            getUnitSyllabusContext(unit.nodeId),
          )
        : Effect.succeed(null);

    const [memories, resolvedDifficulty, syllabus] = yield* Effect.all(
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
        loadSyllabus,
      ],
      { concurrency: 3 },
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
    // A fresh recall run has no difficulty snapshot yet; its first prompted
    // commit is the presentation that opens the measured attempt.
    const isFreshRecallPresentation =
      recallFocus !== null && unitRun.difficultySnapshot === null;
    const contextBlock = buildUnitTurnContext({
      unit,
      state: unitRun,
      policy: recipe.policy,
      memories,
      difficultyLine: difficultySnapshot.promptBlock,
      pendingConnectTeach: readPendingConnectTeach(unitResponses),
      scenarioSpec: unitRun.scenarioSpec,
      syllabus,
      recallFocus: recallFocus
        ? {
            primary: {
              label: recallFocus.primary.label,
              gloss: recallFocus.primary.gloss,
            },
            companion: recallFocus.companion
              ? {
                  label: recallFocus.companion.label,
                  gloss: recallFocus.companion.gloss,
                }
              : null,
          }
        : null,
    });

    const turnResult = yield* (deps.runUnitTurn ?? runUnitTurn)({
      state: unitRun,
      recipe,
      contextBlock,
      transcript: toModelMessages(loadedTranscript.transcript),
      storedScenarioSpec: unitRun.scenarioSpec,
      onPartialAssistantMessage,
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
    // atomically opened at presentation. The attempt row itself is the
    // exactly-once guard: getScenarioAttempt returns open attempts only, so a
    // repair turn after a recorded verdict finds none and skips rating.
    let ratingEvaluation: WorkspaceRatingEvaluationCommit | null = null;
    if (turnResult.ratingWrite) {
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
      if (attempt) {
        if (!attempt.solvePresentedAt) {
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
    }

    // Reinforcement rides the rated verdict only: repairs after the first
    // verdict advance the FSM but never touch entry strength again. The ids
    // stamped at presentation win over a recomputed focus so a decay target
    // that shifted mid-interlude cannot credit the wrong skill.
    const presentedRecallEntryIds = [...unitResponses]
      .reverse()
      .find(
        (response) =>
          response.phase === "ai_education" &&
          response.metadata?.recallEntryIds,
      )?.metadata?.recallEntryIds;
    const composedEntryIds = recallFocus
      ? [
          recallFocus.primary.id,
          ...(recallFocus.companion ? [recallFocus.companion.id] : []),
        ]
      : [];
    const syllabusReinforcement =
      recallFocus &&
      ratingEvaluation &&
      turnResult.event.type === "solution_graded"
        ? {
            entryIds: presentedRecallEntryIds ?? composedEntryIds,
            passed: turnResult.event.passed,
          }
        : null;

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
      syllabusReinforcement,
      openRecallAttempt: isFreshRecallPresentation,
      recallEntryIds: composedEntryIds.length > 0 ? composedEntryIds : null,
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
// Entry point
// ---------------------------------------------------------------------------

export const runOneStep = async ({
  sessionId,
  userId,
  turnId,
  turnLeaseId,
  message,
  deps,
  workspaceTurnRepoLayer,
}: {
  sessionId: string;
  userId: string;
  turnId: string;
  turnLeaseId: string;
  message: string;
  deps: WorkspaceTurnOrchestrationDependencies;
  workspaceTurnRepoLayer: Layer.Layer<WorkspaceTurnRepo>;
}): Promise<WorkspaceAiTurnResult> => {
  const turn = await resolveWorkspaceTurn({ sessionId, deps });

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
};
