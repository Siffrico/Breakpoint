import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { ProfileRepoShape } from "../profile-repo";
import { DEFAULT_EDUCATION_EXPERIENCE_CUSTOMIZATION } from "../../training/education-unit/experience";
import { ProfileRepo } from "../profile-repo";
import { getProfileAccountWorkflow } from "./get-account";
import { getEducationExperienceWorkflow } from "./get-education-experience";
import { updateEducationExperienceWorkflow } from "./update-education-experience";

const makeRepo = (
  overrides: Partial<ProfileRepoShape> = {},
): ProfileRepoShape => ({
  getAccountByUserId: () =>
    Effect.succeed({
      name: "Ada Lovelace",
      email: "ada@example.com",
      provider: "github",
      image: null,
    }),
  getGeneralBySession: () => Effect.succeed(null),
  updateGeneralBySession: (input) => Effect.succeed(input),
  getBillingByUserId: () =>
    Effect.succeed({ plan: "free" as const, manageUrl: null }),
  getEducationExperienceByUserId: () => Effect.succeed(null),
  updateEducationExperienceByUserId: (_userId, customization) =>
    Effect.succeed({ version: 1, customization }),
  ...overrides,
});

describe("profile workflows", () => {
  it("runs with an injected repository and no database service", async () => {
    const account = {
      name: "Ada Lovelace",
      email: "ada@example.com",
      provider: "github",
      image: null,
    };
    const repo = makeRepo({
      getAccountByUserId: () => Effect.succeed(account),
    });

    const result = await Effect.runPromise(
      getProfileAccountWorkflow("user-1").pipe(
        Effect.provideService(ProfileRepo, repo),
      ),
    );

    expect(result).toEqual(account);
  });

  it("reads defaults and saves an education experience customization", async () => {
    const repo = makeRepo();
    const initial = await Effect.runPromise(
      getEducationExperienceWorkflow("user-1").pipe(
        Effect.provideService(ProfileRepo, repo),
      ),
    );
    const customization = {
      ...initial.customization,
      main: { instructions: "Use concise diagnostic mentoring moves." },
    };
    const saved = await Effect.runPromise(
      updateEducationExperienceWorkflow("user-1", customization).pipe(
        Effect.provideService(ProfileRepo, repo),
      ),
    );

    expect(initial.customization).toEqual(
      DEFAULT_EDUCATION_EXPERIENCE_CUSTOMIZATION,
    );
    expect(saved.main.instructions).toBe(
      "Use concise diagnostic mentoring moves.",
    );
  });
});
