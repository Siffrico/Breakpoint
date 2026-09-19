import type { Effect } from "effect";
import { Context } from "effect";

import type {
  MissionEvaluation,
  MissionPlan,
  MissionProof,
  MissionSpec,
  MissionStatus,
} from "@acme/validators";

import type { DbError } from "../../../effect/errors";
import type {
  MissionConflictError,
  MissionNotReadyError,
} from "./mission-errors";

/** The mission row, projected structurally so domain code never imports schema. */
export interface MissionRecord {
  readonly id: string;
  readonly userId: string;
  readonly unitRunId: string;
  readonly status: MissionStatus;
  readonly spec: MissionSpec | null;
  readonly plan: MissionPlan | null;
  readonly proof: MissionProof | null;
  readonly debrief: string | null;
  readonly messages: unknown[];
  readonly createdAt: Date;
  readonly updatedAt: Date | null;
}

export interface MissionEvaluationRecord {
  readonly id: string;
  readonly missionId: string;
  readonly attemptNumber: number;
  readonly status: "evaluating" | "evaluated";
  readonly proof: MissionProof;
  readonly evaluation: MissionEvaluation | null;
  readonly createdAt: Date;
}

/**
 * Everything the four mission entrypoints need about one unit run, resolved in
 * a single joined read. Replaces the run → unit → node → parent → plan →
 * mission chain that used to cost six sequential round-trips.
 */
export interface MissionAccess {
  readonly run: {
    readonly id: string;
    readonly sessionId: string;
    readonly mode: string;
  };
  readonly unit: {
    readonly id: string;
    readonly title: string;
    readonly scenarioFocusAreas: string[];
  };
  readonly node: {
    readonly id: string;
    readonly summary: string;
  };
  readonly parentNode: { readonly kind: string } | null;
  readonly plan: { readonly targetIdentity: string };
  readonly mission: MissionRecord | null;
}

/** A reservation is the exclusive right to evaluate one proof, held under an
 * advisory lock. It must be released — see evaluate-mission-attempt. */
export interface MissionEvaluationReservation {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly mission: {
    readonly id: string;
    readonly spec: MissionSpec;
    readonly plan: MissionPlan;
  };
}

export interface ResumableMission {
  readonly unitRunId: string;
  readonly status: MissionStatus;
  readonly spec: MissionSpec | null;
}

export interface MissionRepoShape {
  readonly findUnitRunId: (input: {
    readonly userId: string;
    readonly unitContentId: string;
    readonly sessionId: string;
  }) => Effect.Effect<string | null, DbError>;

  readonly loadMissionAccess: (input: {
    readonly userId: string;
    readonly unitRunId: string;
  }) => Effect.Effect<MissionAccess | null, DbError>;

  readonly listEvaluations: (
    missionId: string,
  ) => Effect.Effect<MissionEvaluationRecord[], DbError>;

  readonly listResumable: (input: {
    readonly userId: string;
    readonly sessionId: string;
  }) => Effect.Effect<ResumableMission[], DbError>;

  readonly upsertTranscript: (input: {
    readonly userId: string;
    readonly unitRunId: string;
    readonly messages: unknown[];
  }) => Effect.Effect<void, DbError>;

  /** Guarded upsert: rejects a completed mission inside the write itself. */
  readonly confirmPlan: (input: {
    readonly userId: string;
    readonly unitRunId: string;
    readonly spec: MissionSpec;
    readonly plan: MissionPlan;
  }) => Effect.Effect<void, DbError | MissionConflictError>;

  /** Guarded update: status and spec/plan presence are enforced in the WHERE. */
  readonly start: (input: {
    readonly userId: string;
    readonly unitRunId: string;
  }) => Effect.Effect<
    void,
    DbError | MissionConflictError | MissionNotReadyError
  >;

  readonly reserveEvaluation: (input: {
    readonly userId: string;
    readonly unitRunId: string;
    readonly proof: MissionProof;
  }) => Effect.Effect<
    MissionEvaluationReservation,
    DbError | MissionConflictError | MissionNotReadyError
  >;

  readonly finishEvaluation: (input: {
    readonly missionId: string;
    readonly attemptId: string;
    readonly proof: MissionProof;
    readonly evaluation: MissionEvaluation;
  }) => Effect.Effect<void, DbError | MissionConflictError>;

  readonly heartbeatEvaluation: (
    attemptId: string,
  ) => Effect.Effect<boolean, DbError>;

  readonly cancelEvaluation: (
    attemptId: string,
  ) => Effect.Effect<void, DbError>;
}

/** Domain-owned mission persistence capability. Live adapter lives outside the domain. */
export class MissionRepo extends Context.Service<
  MissionRepo,
  MissionRepoShape
>()("training/MissionRepo") {}
