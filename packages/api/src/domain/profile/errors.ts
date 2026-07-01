import { Data } from "effect";

/**
 * Typed failures for the profile domain. The router maps these to tRPC codes
 * via Effect.catchTags; infrastructure failures surface as DbError (see
 * effect/errors.ts). Same tagged-error style as education-unit/agents/errors.ts.
 */
export class ProfileNotFoundError extends Data.TaggedError(
  "ProfileNotFoundError",
)<{
  readonly message: string;
}> {}
