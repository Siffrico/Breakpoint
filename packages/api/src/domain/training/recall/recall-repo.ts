import type { Effect } from "effect";
import { Context } from "effect";

import type {
  RecallCommittedResponse,
  RecallCorrectionRecord,
  RecallFirstRetrievalPersistence,
  RecallKnowledgeSnapshot,
  RecallScenario,
  RecallTaskPublic,
  RecallTaskState,
} from "@acme/validators";

import type { DbError } from "../../../effect/errors";
import type {
  RecallConflictError,
  RecallLeaseError,
  RecallNotFoundError,
} from "./errors";
import type { RecallScheduleChange } from "./scheduling";

export interface RecallTaskRecord {
  readonly id: string;
  readonly userId: string;
  readonly planId: string;
  readonly sessionId: string;
  readonly knowledgeItemId: string | null;
  readonly originalTeachingUnitNodeId: string | null;
  readonly strengthAtReservation: number;
  readonly knowledgeSnapshot: RecallKnowledgeSnapshot;
  readonly scenario: RecallScenario | null;
  readonly state: RecallTaskState;
  readonly interactionId: string | null;
  readonly currentQuestion: string | null;
  readonly firstRetrieval: RecallFirstRetrievalPersistence | null;
  readonly correctionHistory: RecallCorrectionRecord[];
  readonly pausedAt: Date | null;
}

export interface ReservedRecallTask {
  readonly task: RecallTaskRecord;
  readonly preparationLeaseId: string;
  readonly previousChallenges: readonly string[];
}

export type RecallAnswerClaim =
  | { readonly status: "claimed"; readonly task: RecallTaskRecord }
  | { readonly status: "processing" }
  | {
      readonly status: "committed";
      readonly response: RecallCommittedResponse;
    };

export interface RecallRepoShape {
  readonly reserveDueTask: (input: {
    userId: string;
    sessionId: string;
    planId: string;
    leaseId: string;
    now: Date;
  }) => Effect.Effect<ReservedRecallTask | null, DbError>;
  readonly savePreparedScenario: (input: {
    taskId: string;
    leaseId: string;
    scenario: RecallScenario;
    interactionId: string;
  }) => Effect.Effect<boolean, DbError>;
  readonly getActiveTask: (input: {
    userId: string;
    sessionId: string;
    planId: string;
    boundaryNodeId: string | null;
  }) => Effect.Effect<RecallTaskRecord | null, DbError>;
  readonly startTask: (input: {
    userId: string;
    taskId: string;
    boundaryNodeId: string | null;
  }) => Effect.Effect<
    RecallTaskRecord,
    DbError | RecallNotFoundError | RecallConflictError
  >;
  readonly pauseTask: (input: {
    userId: string;
    taskId: string;
    now: Date;
  }) => Effect.Effect<
    RecallTaskRecord,
    DbError | RecallNotFoundError | RecallConflictError
  >;
  readonly deferTask: (input: {
    userId: string;
    taskId: string;
    boundaryNodeId: string | null;
    now: Date;
  }) => Effect.Effect<
    RecallTaskRecord,
    DbError | RecallNotFoundError | RecallConflictError
  >;
  readonly claimAnswer: (input: {
    userId: string;
    taskId: string;
    interactionId: string;
    requestId: string;
    answer: string;
    leaseId: string;
    now: Date;
  }) => Effect.Effect<
    RecallAnswerClaim,
    DbError | RecallNotFoundError | RecallConflictError | RecallLeaseError
  >;
  readonly commitAnswer: (input: {
    userId: string;
    task: RecallTaskRecord;
    requestId: string;
    leaseId: string;
    answer: string;
    response: RecallCommittedResponse;
    nextState: RecallTaskState;
    nextInteractionId: string | null;
    currentQuestion: string | null;
    firstRetrieval: RecallFirstRetrievalPersistence | null;
    correctionHistory: RecallCorrectionRecord[];
    schedule: RecallScheduleChange | null;
    now: Date;
  }) => Effect.Effect<
    RecallCommittedResponse,
    DbError | RecallNotFoundError | RecallLeaseError | RecallConflictError
  >;
  readonly releaseAnswer: (input: {
    taskId: string;
    requestId: string;
    leaseId: string;
  }) => Effect.Effect<void, DbError>;
}

export class RecallRepo extends Context.Service<RecallRepo, RecallRepoShape>()(
  "api/RecallRepo",
) {}

export const projectRecallTask = (
  task: RecallTaskRecord,
): RecallTaskPublic => ({
  id: task.id,
  state: task.state,
  interactionId: task.interactionId,
  knowledgeLabel: task.knowledgeSnapshot.label,
  challenge: task.scenario?.challenge ?? null,
  currentQuestion: task.currentQuestion,
  firstRetrieval: task.firstRetrieval
    ? {
        interactionId: task.firstRetrieval.interactionId,
        answer: task.firstRetrieval.answer,
        feedback: task.firstRetrieval.feedback,
        explanation: task.firstRetrieval.explanation,
        correctionQuestion: task.firstRetrieval.correctionQuestion,
        evidence: task.firstRetrieval.evidence,
        passed: task.firstRetrieval.passed,
        answeredAt: new Date(task.firstRetrieval.answeredAt),
      }
    : null,
  correctionHistory: task.correctionHistory,
  pausedAt: task.pausedAt,
});
