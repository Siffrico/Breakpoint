import { TRPCError } from "@trpc/server";
import { Effect } from "effect";

import type { ProfileNotFoundError } from "../domain/profile/errors";
import type { DbError } from "./errors";

interface OwnedSession {
  readonly userId: string | null;
}

export const requireOwnedSession = async <Session extends OwnedSession>({
  getSession,
  userId,
  sessionId,
}: {
  readonly getSession: (sessionId: string) => Promise<Session | null>;
  readonly userId: string;
  readonly sessionId: string;
}): Promise<Session> => {
  const session = await getSession(sessionId);

  if (!session) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This learning project could not be found.",
    });
  }

  if (session.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this learning project.",
    });
  }

  return session;
};

export const translateProfileErrors = <A, R>(
  effect: Effect.Effect<A, DbError | ProfileNotFoundError, R>,
) =>
  effect.pipe(
    Effect.catchTags({
      ProfileNotFoundError: (error) =>
        Effect.fail(
          new TRPCError({ code: "NOT_FOUND", message: error.message }),
        ),
      DbError: () =>
        Effect.fail(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Profile request failed.",
          }),
        ),
    }),
  );
