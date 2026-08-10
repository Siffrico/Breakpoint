import { TRPCError } from "@trpc/server";
import { Cause, Effect, Option } from "effect";

import type {
  MissionConflictReason,
  MissionError,
  MissionNotReadyError,
} from "../domain/training/missions/mission-errors";

/**
 * The one place a mission failure becomes transport. Three surfaces consume it
 * — tRPC procedures, the streaming route, and AI SDK tool callbacks — and each
 * is a five-line adapter over this single table, so they cannot drift.
 *
 * Domain errors carry structured facts and no copy; every learner-visible
 * string is written here. Infrastructure detail (DbError operations, model
 * causes) is logged, never sent.
 */
interface MissionFailure {
  readonly code: TRPCError["code"];
  readonly status: number;
  readonly message: string;
}

const INTERNAL: MissionFailure = {
  code: "INTERNAL_SERVER_ERROR",
  status: 500,
  message: "The mission guide hit an error. Try again.",
};

const precondition = (message: string): MissionFailure => ({
  code: "PRECONDITION_FAILED",
  status: 412,
  message,
});

const conflict = (message: string): MissionFailure => ({
  code: "CONFLICT",
  status: 409,
  message,
});

const NOT_READY: Record<MissionNotReadyError["operation"], MissionFailure> = {
  start: precondition("Choose a mission before starting it."),
  edit_plan: precondition(
    "A mission must be chosen before its plan can change.",
  ),
  evaluate: precondition("This mission is not ready for evaluation."),
};

const CONFLICTS: Record<MissionConflictReason, MissionFailure> = {
  already_completed: conflict("This mission is already closed."),
  start_race: conflict("This mission can no longer be started."),
  evaluation_in_flight: conflict("This proof is already being evaluated."),
  finish_race: conflict("This evaluation could not be saved. Try again."),
};

/** Resolved by function rather than a flat tag lookup: a conflict's copy
 * depends on which guard rejected the write. */
export const resolveMissionFailure = (error: MissionError): MissionFailure => {
  switch (error._tag) {
    case "MissionNotFoundError":
      return {
        code: "NOT_FOUND",
        status: 404,
        message: "Mission unit not found.",
      };
    case "MissionNotEligibleError":
      return {
        code: "FORBIDDEN",
        status: 403,
        message: "This unit is not eligible for a field mission.",
      };
    case "MissionNotReadyError":
      return NOT_READY[error.operation];
    case "MissionConflictError":
      return CONFLICTS[error.reason];
    case "MissionInputError":
      return {
        code: "BAD_REQUEST",
        status: 400,
        message: "Invalid mission request.",
      };
    case "MissionModelUnavailableError":
      return {
        code: "INTERNAL_SERVER_ERROR",
        status: 500,
        message: "Mission chat is unavailable right now.",
      };
    case "MissionEvaluationError":
      return {
        code: "INTERNAL_SERVER_ERROR",
        status: 500,
        message: "Your proof could not be evaluated. Please try again.",
      };
    // Infrastructure failures never describe themselves to the client.
    case "DbError":
      return INTERNAL;
  }
};

const logFields = (error: MissionError): Record<string, unknown> => {
  switch (error._tag) {
    case "DbError":
      return {
        tag: error._tag,
        operation: error.operation,
        kind: error.kind,
        sqlState: error.sqlState,
      };
    case "MissionConflictError":
      return { tag: error._tag, reason: error.reason };
    case "MissionNotReadyError":
      return { tag: error._tag, operation: error.operation };
    case "MissionNotFoundError":
    case "MissionNotEligibleError":
    case "MissionInputError":
    case "MissionModelUnavailableError":
    case "MissionEvaluationError":
      return { tag: error._tag };
  }
};

const logMissionError = <A, R>(effect: Effect.Effect<A, MissionError, R>) =>
  effect.pipe(
    Effect.tapError((error) =>
      Effect.logError("Mission request failed.", logFields(error)),
    ),
  );

export const translateMissionErrors = <A, R>(
  effect: Effect.Effect<A, MissionError, R>,
): Effect.Effect<A, TRPCError, R> =>
  logMissionError(effect).pipe(
    Effect.mapError((error) => {
      const { code, message } = resolveMissionFailure(error);
      return new TRPCError({ code, message, cause: error });
    }),
  );

/** HTTP surface, for the mission stream's preamble. */
export const missionErrorResponse = (error: MissionError): Response => {
  const { status, message } = resolveMissionFailure(error);
  return new Response(message, { status });
};

/**
 * AI SDK tool surface. The model reads whatever this throws and may repeat it
 * to the learner, so the message is always the table's predefined copy — never
 * a domain-supplied string, a DbError, or a cause.
 */
export const toolFailureMessage = (
  cause: Cause.Cause<MissionError>,
): string => {
  const failure = Cause.findErrorOption(cause);
  return Option.isSome(failure)
    ? resolveMissionFailure(failure.value).message
    : INTERNAL.message;
};

/** Tool callbacks report their own failures; the tRPC path logs via translate. */
export const logMissionFailure = logMissionError;
