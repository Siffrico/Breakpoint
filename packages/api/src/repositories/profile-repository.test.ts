import { describe, expect, it } from "vitest";

import {
  TrainingCurriculumPlan,
  TrainingIdentityProfile,
  TrainingIdentityProfileVersion,
} from "@acme/db/schema";

import type { DatabaseClient } from "../effect/db";
import { updateProfileGeneralWorkflow } from "../domain/profile/workflows/update-general";
import { runProfile } from "../router/run-effect";

describe("profile update transaction", () => {
  it("rolls back the first two writes when the third write fails", async () => {
    const original = {
      versionTarget: "old target",
      profileTarget: "old target",
      curriculumTarget: "old target",
    };
    const state = { ...original };
    let write = 0;

    const transactionClient = {
      query: {
        TrainingIdentityProfile: {
          findFirst: () =>
            Promise.resolve({ id: "profile-1", currentVersionId: "version-1" }),
        },
        TrainingIdentityProfileVersion: {
          findFirst: () => Promise.resolve(null),
        },
        user: { findFirst: () => Promise.resolve(null) },
        account: { findFirst: () => Promise.resolve(null) },
      },
      update: (table: unknown) => ({
        set: (values: { targetIdentity?: string }) => ({
          where: () => {
            write += 1;
            if (table === TrainingIdentityProfileVersion) {
              return {
                returning: () => {
                  state.versionTarget =
                    values.targetIdentity ?? state.versionTarget;
                  return Promise.resolve([
                    {
                      targetIdentity: state.versionTarget,
                      motivation: "motivation",
                      hardMoments: [],
                    },
                  ]);
                },
              };
            }
            if (table === TrainingIdentityProfile) {
              state.profileTarget =
                values.targetIdentity ?? state.profileTarget;
              return Promise.resolve([]);
            }
            if (table === TrainingCurriculumPlan && write === 3) {
              return Promise.reject(new Error("third write failed"));
            }
            state.curriculumTarget =
              values.targetIdentity ?? state.curriculumTarget;
            return Promise.resolve([]);
          },
        }),
      }),
    } as unknown as DatabaseClient;

    const database = {
      transaction: async <A>(run: (tx: DatabaseClient) => Promise<A>) => {
        const snapshot = { ...state };
        try {
          return await run(transactionClient);
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        }
      },
    };

    await expect(
      database.transaction((tx) =>
        runProfile(
          tx,
          updateProfileGeneralWorkflow({
            sessionId: "00000000-0000-0000-0000-000000000001",
            targetIdentity: "new target",
            motivation: "motivation",
            hardMoments: [],
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(write).toBe(3);
    expect(state).toEqual(original);
  });
});
