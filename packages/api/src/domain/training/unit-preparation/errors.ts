import { Data } from "effect";

export class UnitContextMissingError extends Data.TaggedError(
  "UnitContextMissingError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Storage read or write during unit preparation failed. */
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

export type UnitPreparationError = UnitContextMissingError | UnitPersistError;
