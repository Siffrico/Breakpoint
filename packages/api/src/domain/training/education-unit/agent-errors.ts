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

export const classifyUnitAgentFailure = (error: unknown): UnitAgentError => {
  if (error instanceof UnitAgentFirstVisibleTimeoutError) return error;
  if (error instanceof UnitAgentWallClockTimeoutError) return error;

  const message = compactFailureMessage(
    failureMessage(error) || "Education unit agent call failed.",
  );
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
