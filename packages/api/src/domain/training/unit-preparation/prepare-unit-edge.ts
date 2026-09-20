/* eslint-disable no-restricted-imports -- This is the explicit Effect-to-tRPC edge adapter. */
import { TRPCError } from "@trpc/server";
import { Effect } from "effect";

import type { UnitPreparationError } from "./errors";

const learnerSafeFailureMessage =
  "Your learning unit could not be prepared. Please try again.";

const causeFields = (cause: unknown): Record<string, unknown> =>
  cause instanceof Error
    ? { causeName: cause.name, causeMessage: cause.message }
    : { causeType: typeof cause };

const logFields = (error: UnitPreparationError): Record<string, unknown> => {
  switch (error._tag) {
    case "UnitPersistError":
    case "UnitContextMissingError":
      return {
        tag: error._tag,
        message: error.message,
        ...causeFields(error.cause),
      };
  }
};

const trpcFailure = (
  error: UnitPreparationError,
  code: TRPCError["code"],
  message: string,
) => Effect.fail(new TRPCError({ code, message, cause: error }));

export const translateUnitPreparationErrors = <A, R>(
  effect: Effect.Effect<A, UnitPreparationError, R>,
) =>
  effect.pipe(
    Effect.tapError((error) =>
      Effect.logError("Unit preparation failed.", logFields(error)),
    ),
    Effect.catchTags({
      UnitContextMissingError: (error) =>
        trpcFailure(error, "BAD_REQUEST", error.message),
      UnitPersistError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", learnerSafeFailureMessage),
    }),
  );
