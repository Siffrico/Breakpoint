import type { NextRequest } from "next/server";

import { auth } from "~/auth/server";

/**
 * Server-side session gate for API route handlers. Every route is a publicly
 * reachable endpoint, so the session must be verified here regardless of any
 * page-level auth — never trust a userId/sessionId from the request body.
 * Returns the verified session, or `null` when unauthenticated.
 */
export const requireSession = async (req: NextRequest) => {
  const session = await auth.api.getSession({ headers: req.headers });
  if (session == null || session.user.id.length === 0) {
    return null;
  }
  return session;
};
