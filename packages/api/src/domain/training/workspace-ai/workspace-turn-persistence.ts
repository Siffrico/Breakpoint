import { Effect } from "effect";

import type {
  UnitDifficultySnapshot,
  UnitReviewChallenge,
  WorkspaceTurnAction,
} from "@acme/validators";

import type { DbError } from "../../../effect/errors";
import type { UnitTurnResult } from "../education-unit/run-unit-turn";
import type { PersistedUnitRun } from "../education-unit/unit-state";
import type {
  CurriculumPlan,
  Debrief,
  DifficultyBand,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiMessage, WorkspaceAiTurnResult } from "./types";
import type { RatingEvidenceError } from "./workspace-errors";
import type { WorkspaceTurnDependencies } from "./workspace-turn";
import { projectScenarioBrief } from "../education-unit/scenario-brief";
import { ratedRoundChallenge } from "../education-unit/unit-state";
import { WorkspacePersistenceError } from "./workspace-errors";
import { resolveWorkspaceTurn } from "./workspace-turn";
import { WorkspaceTurnRepo } from "./workspace-turn-repo";

export interface WorkspaceTurnPersistenceDependencies
  extends Omit<WorkspaceTurnDependencies, "getActivePlan"> {
  claimWorkspaceTurn: (input: {
    sessionId: string;
    action: WorkspaceTurnAction;
    content: string;
    slot: string | null;
    unitId?: string | null;
    turnId: string;
    leaseId: string;
  }) => Promise<
    | { status: "claimed"; claimedAt: Date }
    | { status: "processing" }
    | { status: "completed"; assistantMessage: WorkspaceAiMessage }
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
  listUnitMessages: (
    sessionId: string,
    unitId: string,
  ) => Promise<WorkspaceAiMessage[]>;
  markWorkspaceTurnFailed: (input: {
    sessionId: string;
    turnId: string;
    leaseId: string;
    reason: string;
  }) => Promise<void>;
  claimWorkspaceUnitLease: (input: {
    sessionId: string;
    unitContentId: string;
    leaseId: string;
    run: PersistedUnitRun;
  }) => Promise<PersistedUnitRun | null>;
  renewWorkspaceLeases?: (input: {
    sessionId: string;
    unitContentId: string;
    turnId: string;
    leaseId: string;
  }) => Promise<boolean>;
  releaseWorkspaceUnitLease: (input: {
    sessionId: string;
    unitContentId: string;
    leaseId: string;
  }) => Promise<void>;
}

export type WorkspaceAiTurnPersistenceResult = WorkspaceAiTurnResult;

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
  turnId: string;
  turnLeaseId: string;
  unitLeaseId: string;
  userMessage: WorkspaceUserMessageCommit | null;
  assistantMessage: WorkspaceAssistantMessageCommit;
  phaseResponse: WorkspacePhaseResponseCommit | null;
  ratingEvaluation: WorkspaceRatingEvaluationCommit | null;
  knowledgeCheckOff: WorkspaceKnowledgeCheckOffCommit | null;
  skillPractice?: { knowledgeIds: string[] } | null;
  scenarioPresentation: {
    userId: string;
    nodeId: string;
    snapshot: UnitDifficultySnapshot;
    presentedAt: Date;
    /** The rated round on the board, as its rating attempt stores it. */
    challenge: UnitReviewChallenge;
  } | null;
  solvePresentation: {
    scenarioAttemptId: string | null;
    presentedAt: Date;
  } | null;
  nextRun: PersistedUnitRun;
  completion: {
    nodeId: string;
    attempt: WorkspaceAttemptCommit;
  } | null;
  touchSessionId: string;
}

export interface WorkspaceKnowledgeCheckOffCommit {
  requestedKnowledgeIds: string[];
  targetedKnowledgeIds: string[];
  evidenceNodeId: string;
}

export interface WorkspaceRatingEvaluationCommit {
  scenarioAttemptId: string;
  userId: string;
  nodeId: string;
  checksMet: number;
  checksTotal: number;
  errorCodes: readonly string[];
  wasOverTime: boolean;
  occurredAt: Date;
  bands: readonly DifficultyBand[] | null;
}

const buildUnitCompletionDebrief = (result: UnitTurnResult): Debrief => ({
  seedResponse: "",
  finalArticulation: result.assistantMessage,
  growthDimensions: ["Completed the unit's practice and exam rounds."],
  checksMet: result.grade?.checksMet ?? null,
  checksTotal: result.grade?.checksTotal ?? null,
  readiness: "ready_for_next_unit",
  strengths: result.grade ? [result.grade.reasoning] : [],
  improvements: ["Keep transferring this judgment into real work."],
  failureTags: [],
  nextStep: "Continue to the next training unit.",
});

const verdictLabel = (result: UnitTurnResult): string => {
  if (result.grade) {
    return result.grade.passed ? "parts_met" : "parts_missed";
  }
  if (result.presentedRatedRound) return "exam_presented";
  return "learning_continues";
};

export const saveUnitTurnResult = ({
  sessionId,
  userId,
  message,
  unit,
  plan,
  turnResult,
  ratingEvaluation,
  knowledgeCheckOff = null,
  skillPractice = null,
  tracksRating,
  difficultySnapshot,
  difficultyDirectiveReason,
  turnId,
  turnLeaseId,
  persistUserMessage,
  persistPhaseResponse = true,
  responseSequence,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  unit: UnitContent;
  plan: CurriculumPlan;
  turnResult: UnitTurnResult;
  ratingEvaluation: WorkspaceRatingEvaluationCommit | null;
  knowledgeCheckOff?: WorkspaceKnowledgeCheckOffCommit | null;
  skillPractice?: { knowledgeIds: string[] } | null;
  tracksRating: boolean;
  difficultySnapshot: UnitDifficultySnapshot;
  difficultyDirectiveReason?: string | null;
  turnId: string;
  turnLeaseId: string;
  persistUserMessage: boolean;
  persistPhaseResponse?: boolean;
  responseSequence: number;
  deps: WorkspaceTurnPersistenceDependencies;
}): Effect.Effect<
  WorkspaceAiTurnPersistenceResult,
  DbError | RatingEvidenceError | WorkspacePersistenceError,
  WorkspaceTurnRepo
> =>
  Effect.gen(function* () {
    const nextRun: PersistedUnitRun = {
      ...turnResult.nextRun,
      sessionId,
      userId,
      // A rated grade moved the learner's rating, so the next step resolves
      // a fresh snapshot instead of reusing this one.
      difficultySnapshot:
        ratingEvaluation && turnResult.nextRun.mode === "feedback"
          ? null
          : difficultySnapshot,
    };
    const complete = nextRun.mode === "complete";
    // A rating attempt opens when a rated round goes on the board.
    const ratedChallenge =
      tracksRating && turnResult.presentedRatedRound
        ? ratedRoundChallenge(nextRun, turnResult.assistantMessage)
        : null;
    const presentedAt = new Date();
    const scenarioPresentation = ratedChallenge
      ? {
          userId,
          nodeId: difficultySnapshot.nodeId,
          snapshot: difficultySnapshot,
          presentedAt,
          challenge: ratedChallenge,
        }
      : null;
    const solvePresentation = ratedChallenge
      ? { scenarioAttemptId: null, presentedAt }
      : null;
    const phaseResponse: WorkspacePhaseResponseCommit | null =
      persistPhaseResponse
        ? {
            unitContentId: unit.id,
            sessionId,
            userId,
            phase: "ai_education",
            sequence: responseSequence,
            userResponse: message,
            aiResponse: turnResult.assistantMessage,
            passed: complete,
            score: null,
            metadata: {
              aiEducationStage: nextRun.mode,
              promptKind: "education_unit",
              modelPurpose:
                turnResult.actor === "reviewer" ? "evaluation" : "education",
              verdict: verdictLabel(turnResult),
              evaluationSummary: turnResult.grade?.reasoning,
              checksMet: turnResult.grade?.checksMet,
              checksTotal: turnResult.grade?.checksTotal,
              dimensionResults: turnResult.grade
                ? [...turnResult.grade.criterionResults]
                : undefined,
              difficultyDirectiveReason: difficultyDirectiveReason ?? undefined,
              goldilocksUpdated: ratingEvaluation ? true : undefined,
              feedback: turnResult.assistantMessage,
            },
          }
        : null;
    const completion = complete
      ? {
          nodeId: unit.nodeId,
          attempt: {
            sessionId,
            userId,
            unitId: unit.id,
            response: message,
            debrief: buildUnitCompletionDebrief(turnResult),
            finalArticulation: message,
            growthDimensions: [] as string[],
          },
        }
      : null;

    const workspaceTurnRepo = yield* WorkspaceTurnRepo;
    const { assistantMessage } = yield* workspaceTurnRepo.commitEducationTurn({
      turnId,
      turnLeaseId,
      unitLeaseId: turnLeaseId,
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
        content: turnResult.assistantMessage,
        slot: "education_unit",
        unitId: unit.nodeId,
        turnId,
        metadata:
          turnResult.actor === "reviewer"
            ? {
                passNumber: nextRun.roundNumber,
                ...(difficultyDirectiveReason
                  ? { difficultyDirectiveReason }
                  : {}),
              }
            : difficultyDirectiveReason
              ? { difficultyDirectiveReason }
              : null,
      },
      phaseResponse,
      ratingEvaluation,
      knowledgeCheckOff,
      skillPractice,
      scenarioPresentation,
      solvePresentation,
      nextRun,
      completion,
      touchSessionId: sessionId,
    });

    const nextWorkspaceState = yield* Effect.tryPromise({
      try: async () =>
        (
          await resolveWorkspaceTurn({
            sessionId,
            authorizedPlan: plan,
            deps: {
              ...deps,
              getActivePlan: () => Promise.resolve(plan),
            },
          })
        ).state,
      catch: (cause) =>
        new WorkspacePersistenceError({
          message: "Workspace state could not be replanned.",
          operation: "resolveWorkspaceTurn",
          cause,
        }),
    });
    const messages = yield* Effect.tryPromise({
      try: () => deps.listUnitMessages(sessionId, unit.nodeId),
      catch: (cause) =>
        new WorkspacePersistenceError({
          message: "Workspace messages could not be loaded.",
          operation: "listWorkspaceMessages",
          cause,
        }),
    });

    return {
      passNumber: nextRun.roundNumber,
      state: nextWorkspaceState,
      // Projected from the run this turn just wrote, so the brief the client
      // receives belongs to the pass now on the board — the client's workspace
      // read is bootstrap-frozen and would otherwise serve the prior pass.
      scenario: projectScenarioBrief(nextRun),
      messages,
      assistantMessage,
    };
  });
