/* eslint-disable no-restricted-imports -- This is the explicit Effect-to-tRPC edge adapter. */
import { TRPCError } from "@trpc/server";
import { Cause, Effect, Exit } from "effect";

import type { WorkspaceEducationTurnError } from "./workspace-errors";

const feedbackFailureMessage = "AI feedback could not be prepared.";

const logFields = (
  error: WorkspaceEducationTurnError,
): Record<string, unknown> => {
  switch (error._tag) {
    case "DbError":
      return {
        tag: error._tag,
        operation: error.operation,
        kind: error.kind,
        sqlState: error.sqlState,
      };
    case "WorkspacePersistenceError":
    case "RatingEvidenceError":
      return { tag: error._tag, operation: error.operation };
    case "WorkspaceInputError":
    case "TurnLeaseConflictError":
    case "UnitAgentFirstVisibleTimeoutError":
    case "UnitAgentWallClockTimeoutError":
    case "UnitAgentTimeoutError":
    case "UnitAgentTransientProviderError":
    case "UnitAgentProviderRejectedError":
    case "UnitTurnContractError":
      return { tag: error._tag };
    case "UnitAgentSchemaError":
      return {
        tag: error._tag,
        schemaName: error.schemaName,
        message: error.message.slice(-1_000).replace(/\s+/g, " "),
      };
  }
};

const trpcFailure = (
  error: WorkspaceEducationTurnError,
  code: TRPCError["code"],
  message: string,
) => Effect.fail(new TRPCError({ code, message, cause: error }));

export const translateWorkspaceTurnErrors = <A, R>(
  effect: Effect.Effect<A, WorkspaceEducationTurnError, R>,
): Effect.Effect<A, TRPCError, R> =>
  effect.pipe(
    Effect.tapError((error) =>
      Effect.logError("Workspace education turn failed.", logFields(error)),
    ),
    Effect.catchTags({
      WorkspaceInputError: (error) =>
        trpcFailure(error, "BAD_REQUEST", error.message),
      TurnLeaseConflictError: (error) =>
        trpcFailure(error, "CONFLICT", error.message),
      WorkspacePersistenceError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", feedbackFailureMessage),
      DbError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", feedbackFailureMessage),
      RatingEvidenceError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", feedbackFailureMessage),
      UnitAgentTimeoutError: (error) =>
        trpcFailure(error, "TIMEOUT", feedbackFailureMessage),
      UnitAgentFirstVisibleTimeoutError: (error) =>
        trpcFailure(error, "TIMEOUT", feedbackFailureMessage),
      UnitAgentWallClockTimeoutError: (error) =>
        trpcFailure(error, "TIMEOUT", feedbackFailureMessage),
      UnitAgentTransientProviderError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", feedbackFailureMessage),
      UnitAgentProviderRejectedError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", feedbackFailureMessage),
      UnitAgentSchemaError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", feedbackFailureMessage),
      UnitTurnContractError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", feedbackFailureMessage),
    }),
  );

export const runWorkspaceTurn = async <A>(
  effect: Effect.Effect<A, WorkspaceEducationTurnError>,
  options?: { readonly signal?: AbortSignal },
): Promise<A> => {
  const exit = await Effect.runPromiseExit(
    translateWorkspaceTurnErrors(effect),
    options,
  );

  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};
