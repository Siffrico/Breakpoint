import type { ModelMessage } from "ai";
import type { Scope } from "effect";
import { Effect, Exit } from "effect";

import type { ScenarioFormat } from "@acme/validators";

import type { Memory } from "../../memory/types";
import type { UnitDifficultySnapshot } from "../education-unit/unit";
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
import { buildUnitTurnContext } from "../education-unit/context";
import { runUnitTurn } from "../education-unit/orchestrate-unit-turn";
import { getUnitRecipe } from "../education-unit/unit";
import { boundTranscript } from "../engine/compaction";
import { companionRelation } from "../policies/recall-decay";
import { regimeForNodeKind } from "../engine/progression-model";
import { resolveRatingScope } from "../orchestration/rating-scope";
import { deriveServerAttemptTiming } from "./evaluation-plan";
import {
  RatingEvidenceError,
  TurnLeaseConflictError,
  WorkspaceInputError,
  WorkspacePersistenceError,
} from "./workspace-errors";
import { isUnitAwaitingAdvance, planNextWorkspaceTurn } from "./workspace-turn";
import { saveUnitPhaseResult } from "./workspace-turn-persistence";

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
  deps,
}: {
  sessionId: string;
  unitContentId: string;
  turnId: string;
  turnLeaseId: string;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Effect.Effect<void> => {
  return Effect.tryPromise(() =>
    Promise.all([
      deps.markWorkspaceTurnFailed({
        sessionId,
        turnId,
        leaseId: turnLeaseId,
        reason: "Education turn ended before its atomic commit completed.",
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

const claimTurnAndLoadTranscript = ({
  sessionId,
  slot,
  unitId,
  unitContentId,
  turnId,
  turnLeaseId,
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
      }),
    );
    if (!claimedUnit) {
      return yield* new TurnLeaseConflictError({
        message: "Another answer is already being processed for this unit.",
      });
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
      claimedAt: claim.claimedAt,
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
      unitContentId: unit.id,
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
    // Knowledge context depends only on the unit id (recall interludes skip it
    // — they reinforce old entries, never check off new ones), so it loads in
    // parallel with memories and the difficulty directive instead of waiting
    // for them, saving a DB round-trip on every non-recall education turn.
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
        format: resolvedDifficulty.format,
        dialPreset: resolvedDifficulty.dialPreset,
      };
    }

    // The two-regime switch, decided by the one canonical kind→regime mapping
    // (progression-model.ts): a foundation unit never writes the ability ELO —
    // its mastery is concept coverage. Skillset units and recall runs write.
    const unitNode = plan.nodes.find((planNode) => planNode.id === unit.nodeId);
    const unitParentKind = plan.nodes.find(
      (planNode) => planNode.id === unitNode?.parentNodeId,
    )?.kind;
    const isFoundationUnit =
      unitParentKind != null &&
      regimeForNodeKind(unitParentKind) === "foundation" &&
      recallFocus === null;
    const recipe = getUnitRecipe(unitRun.recipeVersion, ratingScope, {
      writesRating: !isFoundationUnit,
    });
    // A fresh recall run has no difficulty snapshot yet; its first prompted
    // commit is the presentation that opens the measured attempt.
    const isFreshRecallPresentation =
      recallFocus !== null && unitRun.difficultySnapshot === null;
    const contextBlock = buildUnitTurnContext({
      unit,
      state: unitRun,
      policy: recipe.policy,
      passes: recipe.passes,
      memories,
      difficultyLine: difficultySnapshot.promptBlock,
      pendingConnectTeach: readPendingConnectTeach(unitResponses),
      scenarioSpec: unitRun.scenarioSpec,
      knowledge,
      recallFocus: recallFocus
        ? {
            primary: {
              label: recallFocus.primary.label,
              content: recallFocus.primary.content,
            },
            companion: recallFocus.companion
              ? {
                  label: recallFocus.companion.label,
                  content: recallFocus.companion.content,
                  relation: companionRelation(
                    recallFocus.primary,
                    recallFocus.companion,
                  ),
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
    const knowledgeCheckOff =
      turnResult.nextState.phase === "mastered" && knowledge
        ? {
            requestedKnowledgeIds: knowledge.targets.map((entry) => entry.id),
            targetedKnowledgeIds: knowledge.targets.map((entry) => entry.id),
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
    // Timing anchors on the durable turn claim (claimedAt), not on a clock
    // read here — by now the grader has run, and its latency (up to ~135s
    // with retries) must not count against the learner's solve budget.
    let ratingEvaluation: WorkspaceRatingEvaluationCommit | null = null;
    if (turnResult.ratingWrite) {
      if (!scenarioAttemptId) {
        return yield* new RatingEvidenceError({
          message:
            "Pass-2 evaluation requires the scenario attempt opened at presentation.",
        });
      }
      const gradedAt = new Date();
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
          submittedAt: loadedTranscript.claimedAt,
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
          occurredAt: gradedAt,
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
    const knowledgeReinforcement =
      recallFocus &&
      ratingEvaluation &&
      turnResult.event.type === "solution_graded"
        ? {
            knowledgeIds: presentedRecallEntryIds ?? composedEntryIds,
            passed: turnResult.event.passed,
          }
        : null;

    // Concept coverage: every passed solve credits the unit's target concepts
    // with one rep at the support level it was earned under. This counter —
    // not a rating — is what masters a skill (see engine/concept-coverage.ts),
    // so it rides the same atomic commit as the verdict.
    const conceptCoverage =
      !recallFocus &&
      knowledge &&
      turnResult.event.type === "solution_graded" &&
      turnResult.event.passed
        ? {
            knowledgeIds: knowledge.targets.map((entry) => entry.id),
            helpLevel: difficultySnapshot.directive.supportLevel,
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
      knowledgeCheckOff,
      knowledgeReinforcement,
      conceptCoverage,
      writeOnPass: recipe.goldilocks.writeOnPass,
      writesRating: recipe.goldilocks.writesRating,
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
    const skillNodeId = node.parentNodeId;
    if (
      turnResult.nextState.phase === "mastered" &&
      // A recall run masters a reopened unit, not the live frontier — its
      // parent cluster must not pre-generate (the locked advance-gate check
      // would also reject it, but the intent belongs here).
      recallFocus === null &&
      skillNodeId &&
      deps.pregenerateNextUnit
    ) {
      const pregenerateNextUnit = deps.pregenerateNextUnit;
      // Failures are logged and swallowed: the advance path regenerates, so a
      // dead pre-generation must never surface into the turn.
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
