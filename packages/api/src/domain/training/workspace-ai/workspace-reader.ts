import type { Effect } from "effect";
import { Context, Effect as Fx } from "effect";

import type { DbError } from "../../../effect/errors";
import type { PersistedUnitRun } from "../education-unit/unit";
import type { RecallCandidateEntry } from "../policies/recall-decay";
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
  readonly listPhaseResponsesBySession: (
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  readonly getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  readonly getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Promise<PersistedUnitRun | null>;
  readonly getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  readonly listRecallCandidates: (
    planId: string,
  ) => Promise<RecallCandidateEntry[]>;
}

export interface WorkspaceProjectionReaderShape {
  readonly getActivePlan: (
    sessionId: string,
  ) => Effect.Effect<CurriculumPlan | null, DbError>;
  readonly listPhaseResponsesBySession: (
    sessionId: string,
  ) => Effect.Effect<PhaseResponseRecord[], DbError>;
  readonly getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Effect.Effect<PhaseResponseRecord[], DbError>;
  readonly getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Effect.Effect<PersistedUnitRun | null, DbError>;
  readonly getUnitByNodeId: (
    nodeId: string,
  ) => Effect.Effect<UnitContent | null, DbError>;
  readonly listRecallCandidates: (
    planId: string,
  ) => Effect.Effect<RecallCandidateEntry[], DbError>;
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
  listPhaseResponsesBySession: (sessionId) =>
    read("listPhaseResponsesBySession", () =>
      source.listPhaseResponsesBySession(sessionId),
    ),
  getPhaseResponses: (unitContentId, sessionId) =>
    read("getPhaseResponses", () =>
      source.getPhaseResponses(unitContentId, sessionId),
    ),
  getUnitRun: (sessionId, unitContentId) =>
    read("getUnitRun", () => source.getUnitRun(sessionId, unitContentId)),
  getUnitByNodeId: (nodeId) =>
    read("getUnitByNodeId", () => source.getUnitByNodeId(nodeId)),
  listRecallCandidates: (planId) =>
    read("listRecallCandidates", () => source.listRecallCandidates(planId)),
});

export interface AiWorkspaceReaderSource {
  readonly listMessages: (
    sessionId: string,
    slot?: "education_unit" | "recall",
  ) => Promise<WorkspaceAiMessage[]>;
  readonly getScenarioAttemptStartedAt: (input: {
    scenarioAttemptId: string;
    nodeId: string;
  }) => Promise<Date | null>;
}

export interface AiWorkspaceReaderShape {
  readonly listMessages: (
    sessionId: string,
    slot?: "education_unit" | "recall",
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
  listMessages: (sessionId, slot) =>
    read("listMessages", () => source.listMessages(sessionId, slot)),
  getScenarioAttemptStartedAt: (input) =>
    read("getScenarioAttemptStartedAt", () =>
      source.getScenarioAttemptStartedAt(input),
    ),
});
