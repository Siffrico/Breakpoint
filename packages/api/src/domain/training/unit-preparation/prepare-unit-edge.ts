/* eslint-disable no-restricted-imports -- This is the explicit Effect-to-tRPC edge adapter. */
import { TRPCError } from "@trpc/server";
import { Cause, Effect, Exit } from "effect";

import type { UnitContent } from "../types/training.types";
import type { UnitPreparationError } from "./errors";
import type { PrepareUnitContentInput } from "./prepare-unit-content";
import { prepareUnitContent } from "./prepare-unit-content";

const learnerSafeFailureMessage =
  "Your learning unit could not be prepared. Please try again.";

export const translateUnitPreparationErrors = <A, R>(
  effect: Effect.Effect<A, UnitPreparationError, R>,
) =>
  effect.pipe(
    Effect.catchTags({
      UnitNotReadyError: () =>
        Effect.fail(
          new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "UNIT_PREPARING",
          }),
        ),
      UnitContextMissingError: (error) =>
        Effect.fail(
          new TRPCError({ code: "BAD_REQUEST", message: error.message }),
        ),
      UnitScaffoldError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: learnerSafeFailureMessage,
          }),
        ),
      UnitPersistError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: learnerSafeFailureMessage,
          }),
        ),
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

export const raiseUnitPreparationError = async (
  error: UnitPreparationError,
): Promise<never> => {
  const exit = await Effect.runPromiseExit(
    translateUnitPreparationErrors(Effect.fail(error)),
  );
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
  throw new Error("Unit preparation failure unexpectedly succeeded.");
};
