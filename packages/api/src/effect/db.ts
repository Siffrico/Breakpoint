import { Context, Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";

import type { DbFailureKind } from "./errors";
import { DbError } from "./errors";

/** The Drizzle client. Inside a transaction the tx handle is provided in its
 * place (structurally the same query surface), so repositories are agnostic to
 * whether they run in a transaction. */
export type DatabaseClient = typeof databaseClient;

export interface DbShape {
  readonly client: DatabaseClient;
}

/**
 * The database as a service. Instead of threading a `db` argument through every
 * repository and workflow, effects request `Db` from context and the caller
 * provides it once (the root client, or an open transaction's handle) at the
 * tRPC boundary via `Effect.provideService(Db, …)`.
 */
export class Db extends Context.Service<Db, DbShape>()("api/Db") {}

const readErrorCode = (cause: unknown): string | undefined => {
  let current = cause;
  const visited = new Set<unknown>();

  while (typeof current === "object" && current !== null) {
    if (visited.has(current)) return undefined;
    visited.add(current);
    if ("code" in current && typeof current.code === "string") {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }

  return undefined;
};

export const classifyDbFailure = (
  cause: unknown,
): {
  readonly kind: DbFailureKind;
  readonly sqlState?: string;
} => {
  const code = readErrorCode(cause);
  if (!code) return { kind: "unknown" };
  if (code === "40001") return { kind: "serialization", sqlState: code };
  if (code === "40P01") return { kind: "deadlock", sqlState: code };
  if (code === "57014" || code === "ETIMEDOUT") {
    return {
      kind: "timeout",
      ...(code.length === 5 ? { sqlState: code } : {}),
    };
  }
  if (
    code.startsWith("08") ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EPIPE"
  ) {
    return {
      kind: "connection",
      ...(code.length === 5 ? { sqlState: code } : {}),
    };
  }
  if (code.startsWith("23")) return { kind: "constraint", sqlState: code };
  if (/^[0-9A-Z]{5}$/.test(code)) return { kind: "query", sqlState: code };
  return { kind: "unknown" };
};

export const makeDbError = (operation: string, cause: unknown): DbError => {
  const classification = classifyDbFailure(cause);
  return new DbError({
    message: `Database operation failed: ${operation}`,
    operation,
    ...classification,
    cause,
  });
};

/**
 * Run a Drizzle query against whatever client the `Db` service currently holds,
 * mapping any rejection into a typed `DbError`. Every repository method routes
 * through this, so error typing lives in exactly one place.
 */
export const query = <A>(
  operation: string,
  run: (client: DatabaseClient) => Promise<A>,
): Effect.Effect<A, DbError, Db> =>
  Effect.gen(function* () {
    const { client } = yield* Db;
    return yield* Effect.tryPromise({
      try: () => run(client),
      catch: (cause) => makeDbError(operation, cause),
    });
  });

/** Lift a query when a layer has already captured its request-scoped client. */
export const queryWithClient = <A>(
  client: DatabaseClient,
  operation: string,
  run: (client: DatabaseClient) => Promise<A>,
): Effect.Effect<A, DbError> =>
  Effect.tryPromise({
    try: () => run(client),
    catch: (cause) => makeDbError(operation, cause),
  });
