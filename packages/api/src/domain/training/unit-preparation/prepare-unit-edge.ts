/* eslint-disable no-restricted-imports -- This is the explicit Effect-to-tRPC edge adapter. */
import { TRPCError } from "@trpc/server";
import { Cause, Effect, Exit } from "effect";

import type { UnitContent } from "../types/training.types";
import type { UnitPreparationError } from "./errors";
import type { PrepareUnitContentInput } from "./prepare-unit-content";
import { prepareUnitContent } from "./prepare-unit-content";

const learnerSafeFailureMessage =
  "Your learning unit could not be prepared. Please try again.";

const causeFields = (cause: unknown): Record<string, unknown> =>
  cause instanceof Error
    ? { causeName: cause.name, causeMessage: cause.message }
    : { causeType: typeof cause };

const logFields = (error: UnitPreparationError): Record<string, unknown> => {
  switch (error._tag) {
    case "UnitScaffoldError":
      return {
        tag: error._tag,
        kind: error.kind,
        message: error.message,
        ...causeFields(error.cause),
      };
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
      UnitScaffoldError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", learnerSafeFailureMessage),
      UnitPersistError: (error) =>
        trpcFailure(error, "INTERNAL_SERVER_ERROR", learnerSafeFailureMessage),
    }),
  );

export const runPrepareUnit = async (
  input: PrepareUnitContentInput,
): Promise<UnitContent> => {
  const exit = await Effect.runPromiseExit(
    translateUnitPreparationErrors(prepareUnitContent(input)),
  );

  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};
