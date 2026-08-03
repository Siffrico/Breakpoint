import type { ModelMessage } from "ai";
import type { Scope } from "effect";
import { Cause, Effect, Exit } from "effect";

import type { ScenarioFormat, UnitDifficultySnapshot } from "@acme/validators";

import type { Memory } from "../../memory/types";
import type { DifficultyDialPreset, ScenarioDirective } from "../engine/rating";
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
import { resolveEducationExperience } from "../education-unit/experience";
import { runUnitTurn } from "../education-unit/run-unit-turn";
import type { UnitContextAudience } from "../education-unit/unit-context";
import { buildUnitContext } from "../education-unit/unit-context";
import { boundTranscript } from "../engine/compaction";
import { regimeForNodeKind } from "../engine/progression-model";
import { resolveRatingScope } from "../orchestration/rating-scope";
import { companionRelation } from "../policies/recall-decay";
import { deriveServerAttemptTiming } from "./attempt-timing";
import {
  RatingEvidenceError,
  TurnLeaseConflictError,
  WorkspaceInputError,
  WorkspacePersistenceError,
} from "./workspace-errors";
import { WORKSPACE_LEASE_HEARTBEAT_MS } from "./workspace-lease";
import { isUnitAwaitingAdvance, planNextWorkspaceTurn } from "./workspace-turn";
import { saveUnitTurnResult } from "./workspace-turn-persistence";

interface ResolvedDifficultyDirectiveResult {
  directive: ScenarioDirective;
  promptBlock: string;
  ratingSnapshot: string;
  learnerRating: number;
  format: ScenarioFormat;
  dialPreset: DifficultyDialPreset;
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
  getUnitKnowledgeContext?: (unitNodeId: string) => Promise<{
    skillNodeId: string;
    workflow: { name: string; steps: string[] };
    framing: { question: string; part: number } | null;
    checked: { label: string; content: string }[];
    targets: {
      id: string;
      kind: "concept" | "mechanism";
      label: string;
      content: string;
    }[];
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
  pregenerateNextUnit?: (input: {
    sessionId: string;
    userId: string;
    skillNodeId: string;
  }) => Promise<void>;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
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
      /**
       * When the learner's message first reached the server (the durable turn
       * claim). Attempt timing must anchor here, never on a timestamp taken
       * after the model call — evaluator latency is not the learner's time.
       */
      claimedAt: Date;
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
  unitContentId,
  turnId,
  turnLeaseId,
  reason,
  deps,
}: {
  sessionId: string;
  unitContentId: string;
  turnId: string;
  turnLeaseId: string;
  reason: string;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Effect.Effect<void> => {
  return Effect.tryPromise(() =>
    Promise.all([
      deps.markWorkspaceTurnFailed({
        sessionId,
        turnId,
        leaseId: turnLeaseId,
        reason,
      }),
      deps.releaseWorkspaceUnitLease({
        sessionId,
        unitContentId,
        leaseId: turnLeaseId,
      }),
    ]),
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

/**
 * Keeps this request's claim on the turn visibly alive for as long as the
 * request is. Forked into the turn's scope, so it is interrupted the moment the
 * turn ends — by commit, by failure, or by the client aborting the stream. If
 * the process dies instead, the renewals simply stop and the leases expire on
 * their own, which is the only signal a dead process can send.
 */
const heartbeatLeases = ({
  sessionId,
  unitContentId,
  turnId,
  turnLeaseId,
  deps,
}: {
  sessionId: string;
  unitContentId: string;
  turnId: string;
  turnLeaseId: string;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Effect.Effect<void, never, Scope.Scope> => {
  const renewWorkspaceLeases = deps.renewWorkspaceLeases;
  if (!renewWorkspaceLeases) return Effect.void;

  return Effect.forkScoped(
    Effect.forever(
      Effect.sleep(WORKSPACE_LEASE_HEARTBEAT_MS).pipe(
        Effect.andThen(
          Effect.tryPromise(() =>
            renewWorkspaceLeases({
              sessionId,
              unitContentId,
              turnId,
              leaseId: turnLeaseId,
            }),
          ),
        ),
        // Losing the lease ends the loop: the commit's own lease assertions are
        // what reject the turn, so there is nothing to do here but stop.
        Effect.flatMap((held) =>
          held ? Effect.void : Effect.fail("released"),
        ),
      ),
    ).pipe(
      Effect.tapCause((cause) =>
        Effect.logWarning("Workspace turn lease heartbeat stopped.", {
          cause,
          sessionId,
          turnId,
        }),
      ),
      Effect.ignore,
    ),
  ).pipe(Effect.asVoid);
};

const claimTurnAndLoadTranscript = ({
  sessionId,
  slot,
  unitId,
  unitContentId,
  turnId,
  turnLeaseId,
  unitRun,
  message,
  appendSyntheticUserMessage,
  deps,
}: {
  sessionId: string;
  slot: "education_unit" | "recall";
  unitId: string;
  unitContentId: string;
  turnId: string;
  turnLeaseId: string;
  unitRun: ResolvedWorkspaceTurn["unitRun"];
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
          ? releaseClaimedTurn({
              sessionId,
              unitContentId,
              turnId,
              turnLeaseId,
              reason: Cause.hasInterruptsOnly(exit.cause)
                ? "Education turn ended before its atomic commit completed."
                : (() => {
                    const failure = Cause.squash(exit.cause);
                    return failure instanceof Error
                      ? failure.message
                      : "Education turn ended before its atomic commit completed.";
                  })(),
              deps,
            })
          : Effect.void,
      );
    }
    const claimedUnit = yield* persistPromise("claimWorkspaceUnitLease", () =>
      deps.claimWorkspaceUnitLease({
        sessionId,
        unitContentId,
        leaseId: turnLeaseId,
        run: unitRun,
      }),
    );
    if (!claimedUnit) {
      return yield* new TurnLeaseConflictError({
        message: "Another answer is already being processed for this unit.",
      });
    }
    yield* heartbeatLeases({
      sessionId,
      unitContentId,
      turnId,
      turnLeaseId,
      deps,
    });

    // Each unit is its own chat. Structured todo evidence survives outside the
    // verbatim window, so bounding a long adaptive loop cannot erase durable
    // progress and needs no summarization model on the hot path.
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
      claimedAt: claim.claimedAt,
    };
  });

// ---------------------------------------------------------------------------
// Education-unit path
// ---------------------------------------------------------------------------

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
  onAssistantMessage?: (content: string) => void;
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
      unitContentId: unit.id,
      turnId,
      turnLeaseId,
      unitRun,
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

    const experience = yield* resolveEducationExperience(
      unitRun.experience,
    ).pipe(
      Effect.mapError(
        () =>
          new WorkspaceInputError({
            message: "This unit's learning experience is no longer available.",
          }),
      ),
    );
    const ratingScope = resolveRatingScope({ unit, planNodes: plan.nodes });
    const recallFocus = turn.recallFocus;
    const getUnitKnowledgeContext = deps.getUnitKnowledgeContext;
    const loadKnowledge =
      !recallFocus && getUnitKnowledgeContext
        ? persistPromise("getUnitKnowledgeContext", () =>
            getUnitKnowledgeContext(unit.nodeId),
          )
        : Effect.succeed(null);
    const [memories, resolvedDifficulty, knowledge] = yield* Effect.all(
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
        loadKnowledge,
      ],
      { concurrency: 3 },
    );
    const difficultySnapshot: UnitDifficultySnapshot =
      unitRun.difficultySnapshot ??
      (resolvedDifficulty
        ? {
            nodeId: ratingScope.nodeId,
            directive: resolvedDifficulty.directive,
            promptBlock: resolvedDifficulty.promptBlock,
            ratingSnapshot: resolvedDifficulty.ratingSnapshot,
            learnerRating: resolvedDifficulty.learnerRating,
            format: resolvedDifficulty.format,
            dialPreset: resolvedDifficulty.dialPreset,
          }
        : yield* new RatingEvidenceError({
            message: "Goldilocks did not resolve a unit difficulty snapshot.",
          }));

    const unitNode = plan.nodes.find((planNode) => planNode.id === unit.nodeId);
    const unitParentKind = plan.nodes.find(
      (planNode) => planNode.id === unitNode?.parentNodeId,
    )?.kind;
    const isFoundationUnit =
      unitParentKind != null &&
      regimeForNodeKind(unitParentKind) === "foundation" &&
      recallFocus === null;
    const tracksRating = !isFoundationUnit;
    const recallContext = recallFocus
      ? `\n\n## Recall focus\nIndependently stress-test retrieval and use of: ${recallFocus.primary.label} — ${recallFocus.primary.content}${
          recallFocus.companion
            ? `\nCompose it with ${recallFocus.companion.label} — ${recallFocus.companion.content} (${companionRelation(recallFocus.primary, recallFocus.companion)} relation).`
            : ""
        }\nThis is a spaced review, not a fresh lesson.`
      : "";
    const buildContext = (
      run: typeof unitRun,
      audience: UnitContextAudience,
    ) =>
      `${buildUnitContext({
        audience,
        unit,
        run: { ...run, difficultySnapshot },
        experience,
        targetIdentity: plan.targetIdentity,
        memories,
        knowledge,
        difficultyLine: difficultySnapshot.promptBlock,
      })}${recallContext}`;

    const turnResult = yield* (deps.runUnitTurn ?? runUnitTurn)({
      run: { ...unitRun, difficultySnapshot },
      masteryContract: unitRun.masteryContract,
      transcript: toModelMessages(loadedTranscript.transcript),
      experience,
      buildContext,
      onPartialAssistantMessage,
    });

    const scenarioAttemptId = [...unitResponses]
      .reverse()
      .find(
        (response) =>
          (response.phase === "ai_education" ||
            response.phase === "ai_recall") &&
          response.metadata?.scenarioAttemptId,
      )?.metadata?.scenarioAttemptId;
    let ratingEvaluation: WorkspaceRatingEvaluationCommit | null = null;
    if (tracksRating && turnResult.ratingWrite) {
      if (!scenarioAttemptId) {
        return yield* new RatingEvidenceError({
          message: "Adversarial grading requires its persisted review attempt.",
        });
      }
      const getScenarioAttempt = deps.getScenarioAttempt;
      if (!getScenarioAttempt) {
        return yield* new RatingEvidenceError({
          message: "Adversarial grading requires scenario attempt reads.",
        });
      }
      const attempt = yield* ratingPromise("getScenarioAttempt", () =>
        getScenarioAttempt({
          scenarioAttemptId,
          userId,
          nodeId: difficultySnapshot.nodeId,
        }),
      );
      if (!attempt) {
        return yield* new RatingEvidenceError({
          message: "The persisted adversarial review attempt was not found.",
        });
      }
      if (!attempt.solvePresentedAt) {
        return yield* new RatingEvidenceError({
          message:
            "Adversarial grading requires a persisted presentation time.",
        });
      }
      const timing = deriveServerAttemptTiming({
        presentedAt: attempt.solvePresentedAt,
        submittedAt: loadedTranscript.claimedAt,
        timeLimitSeconds: 300,
      });
      if (!timing) {
        return yield* new RatingEvidenceError({
          message: "Adversarial review timing could not be derived.",
        });
      }
      ratingEvaluation = {
        scenarioAttemptId,
        userId,
        nodeId: difficultySnapshot.nodeId,
        score: turnResult.ratingWrite.score,
        errorCodes: turnResult.ratingWrite.errorCodes,
        wasOverTime: timing.wasOverTime,
        occurredAt: new Date(),
        bands: ratingScope.bands,
      };
    }

    const completed = turnResult.nextRun.mode === "complete";
    const knowledgeCheckOff =
      completed && turnResult.nextRun.kind === "education" && knowledge
        ? {
            requestedKnowledgeIds: knowledge.targets.map((entry) => entry.id),
            targetedKnowledgeIds: knowledge.targets.map((entry) => entry.id),
            evidenceNodeId: unit.nodeId,
          }
        : null;
    const presentedRecallEntryIds = [...unitResponses]
      .reverse()
      .find((response) => response.metadata?.recallEntryIds)
      ?.metadata?.recallEntryIds;
    const composedEntryIds = recallFocus
      ? [
          recallFocus.primary.id,
          ...(recallFocus.companion ? [recallFocus.companion.id] : []),
        ]
      : [];
    const knowledgeReinforcement =
      recallFocus && ratingEvaluation && turnResult.reviewGrade
        ? {
            knowledgeIds: presentedRecallEntryIds ?? composedEntryIds,
            passed: turnResult.reviewGrade.passed,
          }
        : null;
    const conceptCoverage =
      completed && !recallFocus && knowledge
        ? { knowledgeIds: knowledge.targets.map((entry) => entry.id) }
        : null;

    const result = yield* saveUnitTurnResult({
      sessionId,
      userId,
      message: trimmedMessage,
      state,
      unit,
      plan,
      turnResult,
      ratingEvaluation,
      knowledgeCheckOff,
      knowledgeReinforcement,
      conceptCoverage,
      tracksRating,
      difficultySnapshot,
      difficultyDirectiveReason: difficultySnapshot.directive.reason,
      turnId,
      turnLeaseId,
      persistUserMessage: loadedTranscript.claimedDurableTurn,
      responseSequence: unitResponses.filter(
        (response) =>
          response.phase === "ai_education" || response.phase === "ai_recall",
      ).length,
      deps,
    });

    const skillNodeId = node.parentNodeId;
    if (
      completed &&
      turnResult.nextRun.kind === "education" &&
      skillNodeId &&
      deps.pregenerateNextUnit
    ) {
      const pregenerateNextUnit = deps.pregenerateNextUnit;
      const runPregeneration = () =>
        Effect.runPromise(
          Effect.tryPromise(() =>
            pregenerateNextUnit({ sessionId, userId, skillNodeId }),
          ).pipe(
            Effect.tapCause((cause) =>
              Effect.logError("next unit pre-generation failed", {
                sessionId,
                skillNodeId,
                cause,
              }),
            ),
            Effect.ignore,
          ),
        );
      if (deps.scheduleBackgroundTask) {
        deps.scheduleBackgroundTask(runPregeneration);
      } else {
        void runPregeneration();
      }
    }
    onAssistantMessage?.(result.assistantMessage.content);
    return {
      state: result.state,
      messages: result.messages,
      assistantMessage: result.assistantMessage,
    };
  }).pipe(Effect.scoped);
