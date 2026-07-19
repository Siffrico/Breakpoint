/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1)
 * 2. You want to create a new middleware or type of procedure (see Part 3)
 *
 * tl;dr - this is where all the tRPC server stuff is created and plugged in.
 * The pieces you will need to use are documented accordingly near the end
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod/v4";

import type { Auth } from "@acme/auth";
import { db } from "@acme/db/client";

import { UnitNotReadyError } from "./domain/training/unit-preparation/errors";
import { createRequestReads } from "./lib/request-reads";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */

export const createTRPCContext = async (opts: {
  headers: Headers;
  auth: Auth;
  /**
   * Keeps a fire-and-forget task alive past the response on serverless hosts
   * (Next.js `after`). Absent in environments without such a hook; callers
   * fall back to a detached promise.
   */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
  /**
   * Receives Better Auth's response headers so the caller can forward the
   * session cookie-cache refresh (Set-Cookie). Only HTTP route handlers can
   * do this — RSC callers must omit it. Without at least one forwarding
   * caller the cookie cache expires after its maxAge and every request falls
   * back to a DB session read.
   */
  onAuthResponseHeaders?: (headers: Headers) => void;
}) => {
  const authApi = opts.auth.api;
  let session: Awaited<ReturnType<typeof authApi.getSession>>;
  if (opts.onAuthResponseHeaders) {
    const result = await authApi.getSession({
      headers: opts.headers,
      returnHeaders: true,
    });
    opts.onAuthResponseHeaders(result.headers);
    session = result.response;
  } else {
    session = await authApi.getSession({
      headers: opts.headers,
    });
  }
  return {
    authApi,
    session,
    db,
    // Mutations must not use these reads after writing; the cached promise is stale.
    reads: createRequestReads(db),
    scheduleBackgroundTask: opts.scheduleBackgroundTask,
  };
};
/**
 * 2. INITIALIZATION
 *
 * This is where the trpc api is initialized, connecting the context and
 * transformer
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError:
        error.cause instanceof ZodError
          ? z.flattenError(error.cause as ZodError<Record<string, unknown>>)
          : null,
      unitNodeId:
        error.cause instanceof UnitNotReadyError
          ? (error.cause.nodeId ?? null)
          : null,
    },
  }),
});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these
 * a lot in the /src/server/api/routers folder
 */

/**
 * This is how you create new routers and subrouters in your tRPC API
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

const SLOW_PROCEDURE_THRESHOLD_MS = 200;

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  try {
    return await next();
  } finally {
    const durationMs = Date.now() - start;
    if (durationMs >= SLOW_PROCEDURE_THRESHOLD_MS) {
      console.warn("[trpc] slow procedure", { path, durationMs });
    }
  }
});

/**
 * Public (unauthed) procedure
 *
 * This is the base piece you use to build new queries and mutations on your
 * tRPC API. It does not guarantee that a user querying is authorized, but you
 * can still access user session data if they are logged in
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });
