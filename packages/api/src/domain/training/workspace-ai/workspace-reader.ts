import type { Effect } from "effect";
import { Context, Effect as Fx } from "effect";

import type { DbError } from "../../../effect/errors";
import type { PersistedUnitRun } from "../education-unit/unit";
import type { RecallCandidate } from "../policies/recall-decay";
import type {
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiMessage } from "./types";
import { makeDbError } from "../../../effect/db";

const read = <A>(operation: string, run: () => Promise<A>) =>
  Fx.tryPromise({
    try: run,
    catch: (cause) => makeDbError(operation, cause),
  });

export interface WorkspaceProjectionReaderSource {
  readonly getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  readonly getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  readonly getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Promise<PersistedUnitRun | null>;
  readonly getInFlightRecallRun: (
    sessionId: string,
  ) => Promise<PersistedUnitRun | null>;
  readonly retireInFlightRecallRun: (
    sessionId: string,
    unitContentId: string,
  ) => Promise<void>;
  readonly getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  readonly getRecallCandidatesByIds: (
    planId: string,
    knowledgeIds: readonly string[],
  ) => Promise<RecallCandidate[]>;
  readonly getMostOverdueRecallCandidate: (
    planId: string,
    now: Date,
  ) => Promise<RecallCandidate | null>;
  readonly getRecallCompanionCandidate: (
    skillNodeId: string,
    primary: Pick<
      RecallCandidate,
      "id" | "questionId" | "questionOrderIndex" | "orderIndex"
    >,
    now: Date,
  ) => Promise<RecallCandidate | null>;
}

export interface WorkspaceProjectionReaderShape {
  readonly getActivePlan: (
    sessionId: string,
  ) => Effect.Effect<CurriculumPlan | null, DbError>;
  readonly getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Effect.Effect<PhaseResponseRecord[], DbError>;
  readonly getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Effect.Effect<PersistedUnitRun | null, DbError>;
  readonly getInFlightRecallRun: (
    sessionId: string,
  ) => Effect.Effect<PersistedUnitRun | null, DbError>;
  readonly retireInFlightRecallRun: (
    sessionId: string,
    unitContentId: string,
  ) => Effect.Effect<void, DbError>;
  readonly getUnitByNodeId: (
    nodeId: string,
  ) => Effect.Effect<UnitContent | null, DbError>;
  readonly getRecallCandidatesByIds: (
    planId: string,
    knowledgeIds: readonly string[],
  ) => Effect.Effect<RecallCandidate[], DbError>;
  readonly getMostOverdueRecallCandidate: (
    planId: string,
    now: Date,
  ) => Effect.Effect<RecallCandidate | null, DbError>;
  readonly getRecallCompanionCandidate: (
    skillNodeId: string,
    primary: Pick<
      RecallCandidate,
      "id" | "questionId" | "questionOrderIndex" | "orderIndex"
    >,
    now: Date,
  ) => Effect.Effect<RecallCandidate | null, DbError>;
}

export class WorkspaceProjectionReader extends Context.Service<
  WorkspaceProjectionReader,
  WorkspaceProjectionReaderShape
>()("training/WorkspaceProjectionReader") {}

export const makeWorkspaceProjectionReader = (
  source: WorkspaceProjectionReaderSource,
): WorkspaceProjectionReaderShape => ({
  getActivePlan: (sessionId) =>
    read("getActivePlan", () => source.getActivePlan(sessionId)),
  getPhaseResponses: (unitContentId, sessionId) =>
    read("getPhaseResponses", () =>
      source.getPhaseResponses(unitContentId, sessionId),
    ),
  getUnitRun: (sessionId, unitContentId) =>
    read("getUnitRun", () => source.getUnitRun(sessionId, unitContentId)),
  getInFlightRecallRun: (sessionId) =>
    read("getInFlightRecallRun", () => source.getInFlightRecallRun(sessionId)),
  retireInFlightRecallRun: (sessionId, unitContentId) =>
    read("retireInFlightRecallRun", () =>
      source.retireInFlightRecallRun(sessionId, unitContentId),
    ),
  getUnitByNodeId: (nodeId) =>
    read("getUnitByNodeId", () => source.getUnitByNodeId(nodeId)),
  getRecallCandidatesByIds: (planId, knowledgeIds) =>
    read("getRecallCandidatesByIds", () =>
      source.getRecallCandidatesByIds(planId, knowledgeIds),
    ),
  getMostOverdueRecallCandidate: (planId, now) =>
    read("getMostOverdueRecallCandidate", () =>
      source.getMostOverdueRecallCandidate(planId, now),
    ),
  getRecallCompanionCandidate: (skillNodeId, primary, now) =>
    read("getRecallCompanionCandidate", () =>
      source.getRecallCompanionCandidate(skillNodeId, primary, now),
    ),
});

export interface AiWorkspaceReaderSource {
  readonly listUnitMessages: (
    sessionId: string,
    unitId: string,
  ) => Promise<WorkspaceAiMessage[]>;
  readonly getScenarioAttemptStartedAt: (input: {
    scenarioAttemptId: string;
    nodeId: string;
  }) => Promise<Date | null>;
}

export interface AiWorkspaceReaderShape {
  readonly listUnitMessages: (
    sessionId: string,
    unitId: string,
  ) => Effect.Effect<WorkspaceAiMessage[], DbError>;
  readonly getScenarioAttemptStartedAt: (input: {
    scenarioAttemptId: string;
    nodeId: string;
  }) => Effect.Effect<Date | null, DbError>;
}

export class AiWorkspaceReader extends Context.Service<
  AiWorkspaceReader,
  AiWorkspaceReaderShape
>()("training/AiWorkspaceReader") {}

export const makeAiWorkspaceReader = (
  source: AiWorkspaceReaderSource,
): AiWorkspaceReaderShape => ({
  listUnitMessages: (sessionId, unitId) =>
    read("listUnitMessages", () => source.listUnitMessages(sessionId, unitId)),
  getScenarioAttemptStartedAt: (input) =>
    read("getScenarioAttemptStartedAt", () =>
      source.getScenarioAttemptStartedAt(input),
    ),
});
