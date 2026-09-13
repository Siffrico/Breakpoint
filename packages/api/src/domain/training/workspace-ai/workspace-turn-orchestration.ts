import type { ModelMessage } from "ai";
import type { Scope } from "effect";
import { Cause, Effect, Exit } from "effect";

import type {
  ScenarioFormat,
  UnitDifficultySnapshot,
  UnitReviewChallenge,
  UnitReviewPass,
  WorkspaceTurnAction,
} from "@acme/validators";

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
import { prefillScenario } from "../education-unit/prefill";
import {
  runPassAdvanceTurn,
  runUnitTurn,
} from "../education-unit/run-unit-turn";
import { projectScenarioBrief } from "../education-unit/scenario-brief";
import {
  createCritiqueContext,
  createMentorContext,
  createMentorScenarioContext,
} from "../education-unit/unit-context";
import { boundTranscript } from "../engine/compaction";
import { resolveRatingScope } from "../orchestration/rating-scope";
import { deriveServerAttemptTiming } from "./attempt-timing";
import {
  RatingEvidenceError,
  TurnLeaseConflictError,
  WorkspaceInputError,
  WorkspacePersistenceError,
} from "./workspace-errors";
import { WORKSPACE_LEASE_HEARTBEAT_MS } from "./workspace-lease";
import {
  findLatestPhaseResponse,
  isUnitAwaitingAdvance,
} from "./workspace-turn";
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
  runPassAdvanceTurn?: typeof runPassAdvanceTurn;
  savePendingChallenge?: (input: {
    sessionId: string;
    unitContentId: string;
    kind: string;
    pass: UnitReviewPass;
    challenge: UnitReviewChallenge;
  }) => Promise<void>;
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

const SLOT = "education_unit" as const;

/**
 * What the learner sees where a difficulty note normally sits when the first
 * solve exposes a gap. The transition reads as momentum, not internal state.
 */
const RETRY_SCENARIO_NOTE = "Use the feedback in this fresh scenario.";

const claimTurnAndLoadTranscript = ({
  sessionId,
  unitId,
  unitContentId,
  turnId,
  turnLeaseId,
  unitRun,
  action,
  message,
  deps,
}: {
  sessionId: string;
  unitId: string;
  unitContentId: string;
  turnId: string;
  turnLeaseId: string;
  unitRun: ResolvedWorkspaceTurn["unitRun"];
  action: WorkspaceTurnAction;
  message: string;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Effect.Effect<
  LoadedTurnTranscript,
  TurnLeaseConflictError | WorkspacePersistenceError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    // The claim and the message history do not depend on each other, and the
    // path that matters — a fresh answer — needs both. Reading them together
    // takes a round trip off the latency the learner actually waits through.
    const [claim, persistedMessages] = yield* Effect.all(
      [
        persistPromise("claimWorkspaceTurn", () =>
          deps.claimWorkspaceTurn({
            sessionId,
            action,
            content: message,
            slot: SLOT,
            unitId,
            turnId,
            leaseId: turnLeaseId,
          }),
        ),
        persistPromise("listWorkspaceMessages", () =>
          deps.listUnitMessages(sessionId, unitId),
        ),
      ],
      { concurrency: 2 },
    );

    if (claim.status === "completed") {
      return {
        kind: "cached",
        assistantMessage: claim.assistantMessage,
        // Re-read rather than reuse: the concurrent history read may have
        // raced the commit that produced this very reply, so it can be
        // missing the message being returned alongside it.
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

    // Each unit is its own chat. The durable cursor keeps scenario evidence
    // outside the verbatim window, so bounding a long adaptive loop cannot
    // erase progress or require a summarization model on the hot path.
    //
    // The learner's message is committed with the turn, not before it, so the
    // model's view of this turn has to be assembled here. An `advance_pass`
    // carries no answer at all — appending an empty user turn would put a blank
    // learner message in the transcript for the next grade to score.
    const messages =
      action !== "submit_answer"
        ? persistedMessages
        : [
            ...persistedMessages,
            {
              role: "user" as const,
              content: message,
              sequence:
                Math.max(
                  -1,
                  ...persistedMessages.map((item) => item.sequence),
                ) + 1,
              slot: SLOT,
              unitId,
              turnId,
              metadata: null,
            },
          ];

    return {
      kind: "claimed",
      messages,
      transcript: boundTranscript(messages),
      claimedDurableTurn: action === "submit_answer",
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
  interactionId,
  action = "submit_answer",
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
  interactionId: string;
  action?: WorkspaceTurnAction;
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
    const { plan, state, node, unit, unitRun, unitResponses } = turn;
    if (isUnitAwaitingAdvance({ node, run: unitRun })) {
      return yield* new WorkspaceInputError({
        message: "This unit is complete. Press Next Unit to continue.",
      });
    }
    const advancesPass = action === "advance_pass";
    if (advancesPass && unitRun.mode !== "awaiting_next_pass") {
      return yield* new WorkspaceInputError({
        message: "There is no next challenge to open yet.",
      });
    }
    const ratingScope = resolveRatingScope({ unit, planNodes: plan.nodes });
    const loadTurnContext = Effect.all(
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
    const [loadedTranscript, turnContextExit] = yield* Effect.all(
      [
        claimTurnAndLoadTranscript({
          sessionId,
          unitId: unit.nodeId,
          unitContentId: unit.id,
          turnId,
          turnLeaseId,
          unitRun,
          action,
          message,
          deps,
        }),
        Effect.exit(loadTurnContext),
      ],
      { concurrency: 2 },
    );
    if (loadedTranscript.kind === "cached") {
      onAssistantMessage?.(loadedTranscript.assistantMessage.content);
      return {
        passNumber: unitRun.reviewPass,
        state,
        scenario: projectScenarioBrief(unitRun),
        messages: loadedTranscript.messages,
        assistantMessage: loadedTranscript.assistantMessage,
      };
    }
    if (!Exit.isSuccess(turnContextExit)) {
      return yield* Effect.failCause(turnContextExit.cause);
    }
    const [memories, resolvedDifficulty] = turnContextExit.value;

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

        const previousChallengePrompts = unitRun.cursor.scenarioPrompts;
    // What the last failed scenario found, so the next lesson or scenario aims
    // at that idea instead of restating the unit. Null on a pass and at the
    // start of a run, which is when there is nothing to repair.
    const repairStep = unitRun.cursor.step;
    const repair =
      repairStep.kind === "pass_result" && repairStep.outcome === "fail"
        ? {
            errorCodes: repairStep.errorCodes,
            hypothesis: repairStep.hypothesis,
            dimensionResults: repairStep.evidence,
          }
        : null;
    const contexts = {
      mentor: createMentorContext({
        unitContext: unitRun.unitContext,
        difficulty: difficultySnapshot,
        memories,
        repair,
      }),
      mentorScenario: createMentorScenarioContext({
        unitContext: unitRun.unitContext,
        difficulty: difficultySnapshot,
        previousChallengePrompts,
        repair,
      }),
      critique: {
        judgeAnswer: createCritiqueContext({
          unitContext: unitRun.unitContext,
        }),
      },
    };

    const turnInput = {
      run: { ...unitRun, difficultySnapshot },
      interactionId,
      action,
      transcript: toModelMessages(loadedTranscript.transcript),
      experience,
      contexts,
      onPartialAssistantMessage,
    };
    const turnResult = advancesPass
      ? yield* (deps.runPassAdvanceTurn ?? runPassAdvanceTurn)(turnInput)
      : yield* (deps.runUnitTurn ?? runUnitTurn)(turnInput);

    const scenarioAttemptId = findLatestPhaseResponse(
      unitResponses,
      (response) =>
        response.phase === "ai_education" &&
        response.metadata?.scenarioAttemptId !== undefined,
    )?.metadata?.scenarioAttemptId;
    let ratingEvaluation: WorkspaceRatingEvaluationCommit | null = null;
    if (turnResult.ratingWrite) {
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
    const evidencedTargetIds =
      turnResult.nextRun.cursor.step.kind === "complete"
        ? turnResult.nextRun.cursor.step.evidencedTargetIds
        : [];
    const opensRetry =
      turnResult.reviewGrade?.passed === false &&
      turnResult.nextRun.kind === "education";
    const knowledgeCheckOff =
      completed && turnResult.nextRun.kind === "education"
        ? {
            requestedKnowledgeIds: evidencedTargetIds,
            targetedKnowledgeIds: evidencedTargetIds,
            evidenceNodeId: unit.nodeId,
          }
        : null;
    const skillPractice = completed
      ? {
          knowledgeIds: evidencedTargetIds,
        }
      : null;

    const result = yield* saveUnitTurnResult({
      sessionId,
      userId,
      message,
      unit,
      plan,
      turnResult,
      ratingEvaluation,
      knowledgeCheckOff,
      skillPractice,
      tracksRating: true,
      difficultySnapshot,
      difficultyDirectiveReason:
        opensRetry && !completed
          ? RETRY_SCENARIO_NOTE
          : difficultySnapshot.directive.reason,
      turnId,
      turnLeaseId,
      persistUserMessage: loadedTranscript.claimedDurableTurn,
      persistPhaseResponse: action !== "start_unit",
      responseSequence: unitResponses.filter(
        (response) => response.phase === "ai_education",
      ).length,
      deps,
    });

    const savePendingChallenge = deps.savePendingChallenge;
    const passResult = turnResult.nextRun.cursor.step;
    // A `never-learned-it` diagnosis sends the next turn back to the mentor,
    // who writes its own scenario off the back of the lesson. Pre-generating
    // one here would attach first and silently skip the re-teach.
    const awaitingReteach =
      passResult.kind === "pass_result" &&
      passResult.causeType === "never-learned-it";
    if (
      turnResult.nextRun.mode === "awaiting_next_pass" &&
      savePendingChallenge &&
      !awaitingReteach
    ) {
      const runPassPregeneration = () =>
        Effect.runPromise(
          prefillScenario({
            run: turnResult.nextRun,
            experience,
            context:
              passResult.kind === "pass_result" && passResult.outcome === "fail"
                ? createMentorScenarioContext({
                    unitContext: turnResult.nextRun.unitContext,
                    difficulty: difficultySnapshot,
                    previousChallengePrompts:
                      turnResult.nextRun.cursor.scenarioPrompts,
                    repair: {
                      errorCodes: passResult.errorCodes,
                      hypothesis: passResult.hypothesis,
                      dimensionResults: passResult.evidence,
                    },
                  })
                : contexts.mentorScenario,
          }).pipe(
            Effect.flatMap((challenge) =>
              Effect.tryPromise(() =>
                savePendingChallenge({
                  sessionId,
                  unitContentId: unit.id,
                  kind: turnResult.nextRun.kind,
                  pass: turnResult.nextRun.reviewPass + 1,
                  challenge,
                }),
              ),
            ),
            Effect.tapCause((cause) =>
              Effect.logError("next pass pre-generation failed", {
                sessionId,
                unitContentId: unit.id,
                cause,
              }),
            ),
            Effect.ignore,
          ),
        );
      if (deps.scheduleBackgroundTask) {
        deps.scheduleBackgroundTask(runPassPregeneration);
      } else {
        void runPassPregeneration();
      }
    }

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
      passNumber: result.passNumber,
      state: result.state,
      scenario: result.scenario,
      messages: result.messages,
      assistantMessage: result.assistantMessage,
    };
  }).pipe(Effect.scoped);
