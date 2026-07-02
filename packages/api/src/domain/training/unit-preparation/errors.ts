import { Data } from "effect";

import type { ArtifactFailureKind } from "../orchestration/agent-runtime";
import { classifyFailure } from "../orchestration/agent-runtime";

export class UnitScaffoldError extends Data.TaggedError("UnitScaffoldError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {
  readonly kind: ArtifactFailureKind = classifyFailure(this.cause, false);
}

export class UnitContextMissingError extends Data.TaggedError(
  "UnitContextMissingError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Storage read or write around the scaffold failed; never the model's fault. */
export class UnitPersistError extends Data.TaggedError("UnitPersistError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class UnitNotReadyError extends Data.TaggedError("UnitNotReadyError")<{
  readonly message: string;
  readonly nodeId?: string;
}> {}

export type UnitPreparationError =
  | UnitScaffoldError
  | UnitContextMissingError
  | UnitPersistError
  | UnitNotReadyError;

export const isRetryable = (error: UnitPreparationError): boolean =>
  error._tag === "UnitScaffoldError" &&
  (error.kind === "provider" || error.kind === "timeout");

export const classifyUnitScaffoldFailure = (
  error: unknown,
): UnitScaffoldError =>
  new UnitScaffoldError({
    message:
      error instanceof Error && error.message
        ? error.message
        : "Failed to generate the unit scaffold.",
    cause: error,
  });
