import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { ProfileRepoShape } from "../profile-repo";
import { ProfileRepo } from "../profile-repo";
import { getProfileAccountWorkflow } from "./get-account";

describe("profile workflows", () => {
  it("runs with an injected repository and no database service", async () => {
    const account = {
      name: "Ada Lovelace",
      email: "ada@example.com",
      provider: "github",
      image: null,
    };
    const repo: ProfileRepoShape = {
      getAccountByUserId: () => Effect.succeed(account),
      getGeneralBySession: () => Effect.succeed(null),
      updateGeneralBySession: (input) => Effect.succeed(input),
      getBillingByUserId: () =>
        Effect.succeed({ plan: "free" as const, manageUrl: null }),
    };

    const result = await Effect.runPromise(
      getProfileAccountWorkflow("user-1").pipe(
        Effect.provideService(ProfileRepo, repo),
      ),
    );

    expect(result).toEqual(account);
  });
});
