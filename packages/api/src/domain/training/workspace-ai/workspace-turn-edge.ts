/* eslint-disable no-restricted-imports -- This is the explicit Effect-to-tRPC edge adapter. */
import { TRPCError } from "@trpc/server";
import { Cause, Effect, Exit } from "effect";

import type { WorkspaceEducationTurnError } from "./workspace-errors";

const feedbackFailureMessage = "AI feedback could not be prepared.";

export const translateWorkspaceTurnErrors = <A, R>(
  effect: Effect.Effect<A, WorkspaceEducationTurnError, R>,
) =>
  effect.pipe(
    Effect.catchTags({
      WorkspaceInputError: (error) =>
        Effect.fail(
          new TRPCError({ code: "BAD_REQUEST", message: error.message }),
        ),
      TurnLeaseConflictError: (error) =>
        Effect.fail(
          new TRPCError({ code: "CONFLICT", message: error.message }),
        ),
      TurnLeaseMissingError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: feedbackFailureMessage,
          }),
        ),
      WorkspacePersistenceError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: feedbackFailureMessage,
          }),
        ),
      RatingEvidenceError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: feedbackFailureMessage,
          }),
        ),
      AgentTimeoutError: () =>
        Effect.fail(
          new TRPCError({ code: "TIMEOUT", message: feedbackFailureMessage }),
        ),
      AgentTransientProviderError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: feedbackFailureMessage,
          }),
        ),
      AgentProviderRejectedError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: feedbackFailureMessage,
          }),
        ),
      AgentSchemaError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: feedbackFailureMessage,
          }),
        ),
      EducationUnitContractError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: feedbackFailureMessage,
          }),
        ),
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
