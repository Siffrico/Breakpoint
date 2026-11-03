import type { Scope } from "effect";
import { Cause, Effect, Exit } from "effect";

import type {
  ScenarioFormat,
  UnitDifficultySnapshot,
  UnitPreparedStep,
  WorkspaceTurnAction,
} from "@acme/validators";

import type { Memory } from "../../memory/types";
import type {
  OpeningTeachingInput,
  UnitOpeningError,
} from "../education-unit/prepare-opening";
import type { PersistedUnitRun } from "../education-unit/unit-state";
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
import { draftNextStep } from "../education-unit/draft-step";
import { runUnitTurn } from "../education-unit/run-unit-turn";
import { projectScenarioBrief } from "../education-unit/scenario-brief";
import { createMentorContext } from "../education-unit/unit-context";
import {
  evidencedTargetIds,
  withPreparedDraft,
} from "../education-unit/unit-state";
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

export interface WorkspaceTurnOrchestrationDependencies
  extends WorkspaceTurnDependencies,
    WorkspaceTurnPersistenceDependencies {
  prepareOpening?: (input: {
    nodeId: string;
    run: PersistedUnitRun;
    teaching: OpeningTeachingInput;
  }) => Effect.Effect<string | null, UnitOpeningError>;
  listMemories: (userId: string) => Promise<Memory[]>;
  resolveDifficultyDirective: (input: {
    userId: string;
    nodeId: string;
    now: Date;
    bands?: readonly DifficultyBand[] | null;
  }) => Promise<ResolvedDifficultyDirectiveResult>;
  /** Test seam for deterministic education-unit contract tests. */
  runUnitTurn?: typeof runUnitTurn;
  /** Saves a step written ahead; a no-op if the unit moved on meanwhile. */
  savePreparedStep?: (input: {
    sessionId: string;
    unitContentId: string;
    kind: string;
    prepared: UnitPreparedStep;
    difficultySnapshot: UnitDifficultySnapshot;
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

type ClaimedTurn =
  | {
      kind: "cached";
      assistantMessage: WorkspaceAiMessage;
      messages: WorkspaceAiMessage[];
    }
  | {
      kind: "claimed";
      unitRun: ResolvedWorkspaceTurn["unitRun"];
      unitResponses: ResolvedWorkspaceTurn["unitResponses"];
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
const RETRY_SCENARIO_NOTE = "Use the feedback on the next part.";

/** The answer window a rated round allows for each of its parts. */
const RATED_SECONDS_PER_PART = 300;

const claimTurn = ({
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
  ClaimedTurn,
  TurnLeaseConflictError | WorkspacePersistenceError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const claim = yield* persistPromise("claimWorkspaceTurn", () =>
      deps.claimWorkspaceTurn({
        sessionId,
        action,
        content: message,
        slot: SLOT,
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

    const unitResponses = yield* persistPromise("getPhaseResponses", () =>
      deps.getPhaseResponses(unitContentId, sessionId),
    );

    return {
      kind: "claimed",
      unitRun: claimedUnit,
      unitResponses,
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
    const { plan, state, node, unit } = turn;
    const loaded = yield* claimTurn({
      sessionId,
      unitId: unit.nodeId,
      unitContentId: unit.id,
      turnId,
      turnLeaseId,
      unitRun: turn.unitRun,
      action,
      message,
      deps,
    });
    if (loaded.kind === "cached") {
      onAssistantMessage?.(loaded.assistantMessage.content);
      return {
        passNumber: turn.unitRun.roundNumber,
        state,
        scenario: projectScenarioBrief(turn.unitRun),
        messages: loaded.messages,
        assistantMessage: loaded.assistantMessage,
      };
    }
    const { unitRun, unitResponses } = loaded;
    if (unitRun.cursor.interactionId !== interactionId) {
      return yield* new WorkspaceInputError({
        message: "This interaction has changed. Refresh to continue.",
      });
    }
    if (isUnitAwaitingAdvance({ node, run: unitRun })) {
      return yield* new WorkspaceInputError({
        message: "This unit is complete. Press Next Unit to continue.",
      });
    }
    if (action === "continue" && unitRun.mode !== "feedback") {
      return yield* new WorkspaceInputError({
        message: "There is nothing to continue to yet.",
      });
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
    const calibratedRun = { ...unitRun, difficultySnapshot };

    // The opening lesson is prepared ahead under its own lock; handing it to
    // the runner as the prepared step means the runner has one path for it.
    const openingLesson =
      action === "start_unit" && deps.prepareOpening
        ? yield* deps.prepareOpening({
            nodeId: node.id,
            run: calibratedRun,
            teaching: {
              context: createMentorContext({
                unitContext: unitRun.unitContext,
                difficulty: difficultySnapshot,
                memories,
              }),
              experience,
              onPartialAssistantMessage,
            },
          })
        : null;
    const run = openingLesson
      ? withPreparedDraft(calibratedRun, {
          kind: "lesson",
          inputKey: null,
          lesson: openingLesson,
        })
      : calibratedRun;

    const turnResult = yield* (deps.runUnitTurn ?? runUnitTurn)({
      run,
      interactionId,
      action,
      learnerMessage: message,
      experience,
      memories,
      onPartialAssistantMessage,
    });

    let ratingEvaluation: WorkspaceRatingEvaluationCommit | null = null;
    if (turnResult.ratingWrite) {
      const scenarioAttemptId = findLatestPhaseResponse(
        unitResponses,
        (response) =>
          response.phase === "ai_education" &&
          response.metadata?.scenarioAttemptId !== undefined,
      )?.metadata?.scenarioAttemptId;
      if (!scenarioAttemptId) {
        return yield* new RatingEvidenceError({
          message: "A rated round requires its persisted rating attempt.",
        });
      }
      const timing = deriveServerAttemptTiming({
        presentedAt: turnResult.ratingWrite.presentedAt,
        submittedAt: loaded.claimedAt,
        timeLimitSeconds:
          RATED_SECONDS_PER_PART * turnResult.ratingWrite.partCount,
      });
      if (!timing) {
        return yield* new RatingEvidenceError({
          message: "The rated round's timing could not be derived.",
        });
      }
      ratingEvaluation = {
        scenarioAttemptId,
        userId,
        nodeId: difficultySnapshot.nodeId,
        checksMet: turnResult.ratingWrite.checksMet,
        checksTotal: turnResult.ratingWrite.checksTotal,
        errorCodes: turnResult.ratingWrite.errorCodes,
        wasOverTime: timing.wasOverTime,
        occurredAt: new Date(),
        bands: ratingScope.bands,
      };
    }

    const { nextRun } = turnResult;
    const completed = nextRun.mode === "complete";
    const shownTargetIds = evidencedTargetIds(nextRun);
    const missedPart = turnResult.grade?.passed === false;
    const knowledgeCheckOff =
      completed && nextRun.kind === "education"
        ? {
            requestedKnowledgeIds: shownTargetIds,
            // Every assigned target, so the ones the unit did not show are
            // released to unchecked and recall can bring them back.
            targetedKnowledgeIds: nextRun.unitContext.targets.map(
              (target) => target.id,
            ),
            evidenceNodeId: unit.nodeId,
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
      skillPractice: completed ? { knowledgeIds: shownTargetIds } : null,
      tracksRating: true,
      difficultySnapshot,
      difficultyDirectiveReason:
        missedPart && !completed
          ? RETRY_SCENARIO_NOTE
          : difficultySnapshot.directive.reason,
      turnId,
      turnLeaseId,
      persistUserMessage: loaded.claimedDurableTurn,
      persistPhaseResponse: action !== "start_unit",
      responseSequence: unitResponses.filter(
        (response) => response.phase === "ai_education",
      ).length,
      deps,
    });

    // While the learner reads feedback, write whatever comes next so Continue
    // is instant. The save only lands if nothing has happened since.
    const savePreparedStep = deps.savePreparedStep;
    if (nextRun.mode === "feedback" && savePreparedStep) {
      const runPreparation = () =>
        Effect.runPromise(
          Effect.gen(function* () {
            // A rated grade moved the learner's rating, so the next step is
            // written at the difficulty that rating now calls for.
            const nextDifficulty: UnitDifficultySnapshot = ratingEvaluation
              ? {
                  nodeId: ratingScope.nodeId,
                  ...(yield* ratingPromise("resolveDifficultyDirective", () =>
                    deps.resolveDifficultyDirective({
                      userId,
                      nodeId: ratingScope.nodeId,
                      now: new Date(),
                      bands: ratingScope.bands,
                    }),
                  )),
                }
              : difficultySnapshot;
            const draft = yield* draftNextStep({
              run: { ...nextRun, difficultySnapshot: nextDifficulty },
              experience,
              memories,
            });
            if (!draft) return;
            yield* persistPromise("savePreparedStep", () =>
              savePreparedStep({
                sessionId,
                unitContentId: unit.id,
                kind: nextRun.kind,
                prepared: {
                  interactionId: nextRun.cursor.interactionId,
                  draft,
                },
                difficultySnapshot: nextDifficulty,
              }),
            );
          }).pipe(
            Effect.tapCause((cause) =>
              Effect.logError("next step preparation failed", {
                sessionId,
                unitContentId: unit.id,
                cause,
              }),
            ),
            Effect.ignore,
          ),
        );
      if (deps.scheduleBackgroundTask) {
        deps.scheduleBackgroundTask(runPreparation);
      } else {
        void runPreparation();
      }
    }

    const skillNodeId = node.parentNodeId;
    if (
      completed &&
      nextRun.kind === "education" &&
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
