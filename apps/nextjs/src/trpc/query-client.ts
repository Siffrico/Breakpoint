import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import SuperJSON from "superjson";

import type { AppRouter } from "@acme/api";

// On the client, any UNAUTHORIZED tRPC error means the session is missing or
// expired. Send the user to the auth page once instead of letting queries fail
// silently. Guarded against running on the server (no redirect during SSR) and
// against looping when we're already on /auth.
const redirectToAuthOnUnauthorized = (error: unknown) => {
  if (typeof window === "undefined") return;
  if (!(error instanceof TRPCClientError)) return;
  const trpcError = error as TRPCClientError<AppRouter>;
  if (trpcError.data?.code !== "UNAUTHORIZED") return;
  if (window.location.pathname === "/auth") return;
  window.location.href = "/auth";
};

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({ onError: redirectToAuthOnUnauthorized }),
    mutationCache: new MutationCache({ onError: redirectToAuthOnUnauthorized }),
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
        shouldRedactErrors: () => {
          // We should not catch Next.js server errors
          // as that's how Next.js detects dynamic pages
          // so we cannot redact them.
          // Next.js also automatically redacts errors for us
          // with better digests.
          return false;
        },
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
