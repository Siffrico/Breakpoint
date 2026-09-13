import { TRPCError } from "@trpc/server";
import { Effect } from "effect";

import type { RecallDomainError } from "../domain/training/recall/errors";
import type { DbError } from "./errors";

export const translateRecallErrors = <A, R>(
  effect: Effect.Effect<A, DbError | RecallDomainError, R>,
) =>
  effect.pipe(
    Effect.catchTags({
      RecallNotFoundError: (error) =>
        Effect.fail(
          new TRPCError({ code: "NOT_FOUND", message: error.message }),
        ),
      RecallConflictError: (error) =>
        Effect.fail(
          new TRPCError({ code: "CONFLICT", message: error.message }),
        ),
      RecallLeaseError: (error) =>
        Effect.fail(
          new TRPCError({ code: "CONFLICT", message: error.message }),
        ),
      RecallContractError: (error) =>
        Effect.fail(
          new TRPCError({ code: "BAD_REQUEST", message: error.message }),
        ),
      RecallModelError: (error) =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          }),
        ),
      DbError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Recall progress could not be saved or loaded.",
          }),
        ),
    }),
  );
