import { Data } from "effect";

/**
 * Typed failure channel for the data/infrastructure layer. Mirrors the tagged
 * error style already used by education-unit/agents/errors.ts so the two error
 * systems in this package stay consistent. Router code discriminates on `_tag`
 * via Effect.catchTag(s) instead of matching on message strings.
 */

export type DbFailureKind =
  | "serialization"
  | "deadlock"
  | "connection"
  | "timeout"
  | "constraint"
  | "query"
  | "unknown";

/** A Drizzle/Postgres call rejected (connection drop, timeout, constraint). */
export class DbError extends Data.TaggedError("DbError")<{
  readonly message: string;
  readonly operation: string;
  readonly sqlState?: string;
  readonly kind: DbFailureKind;
  readonly cause?: unknown;
}> {}

/** A row that the caller required to exist was not found. */
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string;
  readonly message?: string;
}> {}

/** A workspace-turn lease was missing or no longer valid. */
export class LeaseError extends Data.TaggedError("LeaseError")<{
  readonly message: string;
}> {}

export type InfraError = DbError | NotFoundError | LeaseError;
