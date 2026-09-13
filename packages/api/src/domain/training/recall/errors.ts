import { Data } from "effect";

export class RecallNotFoundError extends Data.TaggedError(
  "RecallNotFoundError",
)<{ readonly message: string }> {}

export class RecallConflictError extends Data.TaggedError(
  "RecallConflictError",
)<{ readonly message: string }> {}

export class RecallLeaseError extends Data.TaggedError("RecallLeaseError")<{
  readonly message: string;
}> {}

export class RecallContractError extends Data.TaggedError(
  "RecallContractError",
)<{ readonly message: string; readonly cause?: unknown }> {}

export class RecallModelError extends Data.TaggedError("RecallModelError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type RecallDomainError =
  | RecallNotFoundError
  | RecallConflictError
  | RecallLeaseError
  | RecallContractError
  | RecallModelError;
