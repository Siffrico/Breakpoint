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

/**
 * Not part of UnitPreparationError: the prepare path never produces it. It
 * belongs to the workspace send path, where submitting against a unit that is
 * still building is a real failure. Read paths report readiness in-band
 * instead (see AiWorkspaceResult).
 */
export class UnitNotReadyError extends Data.TaggedError("UnitNotReadyError")<{
  readonly message: string;
  readonly nodeId?: string;
}> {}

export type UnitPreparationError =
  | UnitScaffoldError
  | UnitContextMissingError
  | UnitPersistError;

export const isRetryable = (error: UnitPreparationError): boolean =>
  error._tag === "UnitScaffoldError" &&
  (error.kind === "provider" ||
    error.kind === "timeout" ||
    error.kind === "schema");

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
