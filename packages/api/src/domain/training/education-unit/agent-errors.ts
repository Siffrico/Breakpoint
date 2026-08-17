import { APICallError } from "ai";
import { Data } from "effect";

import { classifyFailure } from "../orchestration/agent-runtime";

export class UnitAgentSchemaError extends Data.TaggedError(
  "UnitAgentSchemaError",
)<{
  readonly message: string;
  readonly cause?: unknown;
  readonly schemaName?: string;
}> {}

export class UnitAgentTransientProviderError extends Data.TaggedError(
  "UnitAgentTransientProviderError",
)<{ readonly message: string; readonly cause?: unknown }> {}

export class UnitAgentProviderRejectedError extends Data.TaggedError(
  "UnitAgentProviderRejectedError",
)<{ readonly message: string; readonly cause?: unknown }> {}

export class UnitAgentTimeoutError extends Data.TaggedError(
  "UnitAgentTimeoutError",
)<{ readonly message: string; readonly cause?: unknown }> {}

export class UnitAgentFirstVisibleTimeoutError extends Data.TaggedError(
  "UnitAgentFirstVisibleTimeoutError",
)<{ readonly message: string }> {}

/**
 * The whole call outran its budget. Deliberately not retryable: the inactivity
 * clock cannot catch a model looping inside its reasoning trace (each delta
 * re-arms it), and retrying a call that already burned the budget just doubles
 * the wait the learner is sitting through.
 */
export class UnitAgentWallClockTimeoutError extends Data.TaggedError(
  "UnitAgentWallClockTimeoutError",
)<{ readonly message: string }> {}

export type UnitAgentError =
  | UnitAgentSchemaError
  | UnitAgentTransientProviderError
  | UnitAgentProviderRejectedError
  | UnitAgentTimeoutError
  | UnitAgentFirstVisibleTimeoutError
  | UnitAgentWallClockTimeoutError;

const failureMessage = (error: unknown, depth = 0): string => {
  if (!(error instanceof Error) || depth > 5) return "";

  const nested = failureMessage(error.cause, depth + 1);
  const message = error.message.trim();
  if (!nested || nested === message) return message;
  if (!message) return nested;

  return `${message} Cause: ${nested}`;
};

const compactFailureMessage = (message: string): string => {
  const limit = 2_000;
  if (message.length <= limit) return message;

  const half = limit / 2;
  return `${message.slice(0, half)} … ${message.slice(-half)}`;
};

/**
 * A schema violation arrives wrapped in the provider's error, so the generic
 * classifier reads it as a rejected call. It is not: the model answered, the
 * answer failed our contract, and that is the one failure a repair round can
 * actually fix.
 */
const isValidationFailure = (error: unknown, depth = 0): boolean => {
  if (!(error instanceof Error) || depth > 5) return false;
  return (
    /^(?:AI_)?(?:Zod|TypeValidation)Error$/.test(error.name) ||
    isValidationFailure(error.cause, depth + 1)
  );
};

export const classifyUnitAgentFailure = (error: unknown): UnitAgentError => {
  if (error instanceof UnitAgentFirstVisibleTimeoutError) return error;
  if (error instanceof UnitAgentWallClockTimeoutError) return error;

  const message = compactFailureMessage(
    failureMessage(error) || "Education unit agent call failed.",
  );
  if (isValidationFailure(error)) {
    return new UnitAgentSchemaError({ message, cause: error });
  }
  const kind = classifyFailure(error, false);

  switch (kind) {
    case "schema":
    case "partial":
      return new UnitAgentSchemaError({ message, cause: error });
    case "timeout":
      return new UnitAgentTimeoutError({ message, cause: error });
    case "provider":
    case "save":
      return APICallError.isInstance(error) &&
        (error.statusCode === undefined ||
          error.statusCode === 429 ||
          error.statusCode >= 500)
        ? new UnitAgentTransientProviderError({ message, cause: error })
        : new UnitAgentProviderRejectedError({ message, cause: error });
  }
};

export const nameUnitAgentSchemaError = (
  error: UnitAgentSchemaError,
  schemaName: string,
): UnitAgentSchemaError =>
  new UnitAgentSchemaError({
    message: error.message,
    cause: error.cause,
    schemaName,
  });
