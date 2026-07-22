import { Data } from "effect";

import type { DbError } from "../../../effect/errors";

/**
 * Typed failures for the mission domain. These carry structured facts only —
 * never user-facing copy. The single failure table in effect/mission-edge.ts
 * owns every message the learner can see, so the same failure reads identically
 * whether it surfaces through tRPC, the streaming route, or an AI SDK tool.
 * Same tagged-error style as workspace-ai/workspace-errors.ts.
 */

/** Which lifecycle guard rejected the write. The guards live in the SQL, so
 * these reasons describe what the database decided, not what a prior read saw. */
export type MissionConflictReason =
  | "already_completed"
  | "start_race"
  | "evaluation_in_flight"
  | "finish_race";

/** The unit run, its curriculum context, or the mission row does not exist. */
export class MissionNotFoundError extends Data.TaggedError(
  "MissionNotFoundError",
)<{
  readonly entity: string;
}> {}

/** The unit exists but its progression state does not earn a field mission. */
export class MissionNotEligibleError extends Data.TaggedError(
  "MissionNotEligibleError",
)<{
  readonly unitRunId: string;
}> {}

/** The mission exists but has not reached the state this operation requires. */
export class MissionNotReadyError extends Data.TaggedError(
  "MissionNotReadyError",
)<{
  readonly operation: "start" | "edit_plan" | "evaluate";
}> {}

/** A lifecycle write lost to a concurrent one, or the row already moved on. */
export class MissionConflictError extends Data.TaggedError(
  "MissionConflictError",
)<{
  readonly reason: MissionConflictReason;
}> {}

/** Client-supplied payload the mission transport could not accept. */
export class MissionInputError extends Data.TaggedError("MissionInputError")<{
  readonly field: string;
}> {}

/** No model is configured for the mission purpose. */
export class MissionModelUnavailableError extends Data.TaggedError(
  "MissionModelUnavailableError",
)<{
  readonly purpose: string;
  readonly cause?: unknown;
}> {}

/** The evaluator model could not produce a valid structured verdict. */
export class MissionEvaluationError extends Data.TaggedError(
  "MissionEvaluationError",
)<{
  readonly cause: unknown;
}> {}

export type MissionError =
  | MissionNotFoundError
  | MissionNotEligibleError
  | MissionNotReadyError
  | MissionConflictError
  | MissionInputError
  | MissionModelUnavailableError
  | MissionEvaluationError
  | DbError;
