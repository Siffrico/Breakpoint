import type { NextRequest } from "next/server";
import { after } from "next/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter, createTRPCContext } from "@acme/api";

import { auth } from "~/auth/server";
import { env } from "~/env";

export const preferredRegion = "iad1";

const allowedOrigins = new Set(
  [
    "http://localhost:3000",
    ...(env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : []),
    ...(env.ALLOWED_ORIGINS?.split(",") ?? []),
  ].flatMap((origin) => {
    const trimmed = origin.trim();
    return trimmed ? [trimmed] : [];
  }),
);

/**
 * Configure basic CORS headers
 * You should extend this to match your needs
 */
const setCorsHeaders = (res: Response, req?: NextRequest) => {
  const origin = req?.headers.get("origin");

  if (origin && allowedOrigins.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }

  res.headers.set("Access-Control-Request-Method", "*");
  res.headers.set("Access-Control-Allow-Methods", "OPTIONS, GET, POST");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "content-type, authorization, cookie, x-trpc-source",
  );
  res.headers.set("Access-Control-Allow-Credentials", "true");
};

export const OPTIONS = (req: NextRequest) => {
  const response = new Response(null, {
    status: 204,
  });
  setCorsHeaders(response, req);
  return response;
};

const handler = async (req: NextRequest) => {
  // Better Auth refreshes the session cookie cache only where Set-Cookie can
  // be sent. This endpoint is hit constantly, so forwarding the refresh here
  // keeps the cache warm for every other consumer (RSC, chat routes, SSE).
  let authCookies: string[] = [];
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req,
    createContext: () =>
      createTRPCContext({
        auth: auth,
        headers: req.headers,
        scheduleBackgroundTask: (task) => after(task),
        onAuthResponseHeaders: (headers) => {
          authCookies = headers.getSetCookie();
        },
      }),
    onError({ error, path }) {
      console.error(`>>> tRPC Error on '${path}'`, error);
    },
  });

  for (const cookie of authCookies) {
    response.headers.append("set-cookie", cookie);
  }
  setCorsHeaders(response, req);
  return response;
};

export { handler as GET, handler as POST };
