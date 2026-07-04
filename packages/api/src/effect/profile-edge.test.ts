import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { ProfileNotFoundError } from "../domain/profile/errors";
import { DbError } from "./errors";
import { requireOwnedSession, translateProfileErrors } from "./profile-edge";

describe("profile session authorization", () => {
  it("rejects a session owned by another user", async () => {
    await expect(
      requireOwnedSession({
        getSession: () => Promise.resolve({ userId: "other-user" }),
        userId: "current-user",
        sessionId: "session-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("profile Effect error translation", () => {
  it("maps ProfileNotFoundError to tRPC NOT_FOUND", async () => {
    await expect(
      Effect.runPromise(
        translateProfileErrors(
          Effect.fail(
            new ProfileNotFoundError({ message: "Profile is missing" }),
          ),
        ),
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Profile is missing",
    });
  });

  it("maps DbError to a safe tRPC INTERNAL_SERVER_ERROR", async () => {
    await expect(
      Effect.runPromise(
        translateProfileErrors(
          Effect.fail(
            new DbError({
              message: "connection leaked details",
              operation: "getProfile",
              kind: "connection",
              cause: "secret",
            }),
          ),
        ),
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Profile request failed.",
    });
  });
});
