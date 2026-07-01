import { Context, Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";

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

/**
 * Run a Drizzle query against whatever client the `Db` service currently holds,
 * mapping any rejection into a typed `DbError`. Every repository method routes
 * through this, so error typing lives in exactly one place.
 */
export const query = <A>(
  run: (client: DatabaseClient) => Promise<A>,
): Effect.Effect<A, DbError, Db> =>
  Effect.gen(function* () {
    const { client } = yield* Db;
    return yield* Effect.tryPromise({
      try: () => run(client),
      catch: (cause) =>
        new DbError({ message: "Database query failed", cause }),
    });
  });

/** Lift a query when a layer has already captured its request-scoped client. */
export const queryWithClient = <A>(
  client: DatabaseClient,
  run: (client: DatabaseClient) => Promise<A>,
): Effect.Effect<A, DbError> =>
  Effect.tryPromise({
    try: () => run(client),
    catch: (cause) => new DbError({ message: "Database query failed", cause }),
  });
