import { Effect, Layer } from "effect";

import { and, eq, gte, sql } from "@acme/db";
import {
  account,
  TrainingCurriculumPlan,
  TrainingIdentityProfile,
  TrainingIdentityProfileVersion,
  TrainingUnitAttempt,
  user,
} from "@acme/db/schema";

import type { ProfileBilling } from "../domain/profile/types";
import type { DatabaseClient } from "../effect/db";
import { ProfileNotFoundError } from "../domain/profile/errors";
import { ProfileRepo } from "../domain/profile/profile-repo";
import { Db, queryWithClient } from "../effect/db";

/** Live Drizzle adapter. It captures the request/transaction client at layer construction. */
export const ProfileRepoLive = Layer.effect(
  ProfileRepo,
  Effect.gen(function* () {
    const { client } = yield* Db;
    const query = <A>(
      operation: string,
      run: (client: DatabaseClient) => Promise<A>,
    ) => queryWithClient(client, operation, run);

    return {
      getGeneralBySession: (sessionId) =>
        Effect.gen(function* () {
          const profile = yield* query("getGeneralProfile", (client) =>
            client.query.TrainingIdentityProfile.findFirst({
              where: eq(TrainingIdentityProfile.onboardingSessionId, sessionId),
            }),
          );
          if (!profile?.currentVersionId) return null;
          // Hoist the narrowed value: TS drops property narrowing inside the query
          // closure below, but keeps it for a local const.
          const currentVersionId = profile.currentVersionId;

          const [version, unitActivity] = yield* query(
            "getGeneralProfileDetails",
            (client) =>
              Promise.all([
                client.query.TrainingIdentityProfileVersion.findFirst({
                  where: eq(
                    TrainingIdentityProfileVersion.id,
                    currentVersionId,
                  ),
                }),
                client
                  .select({
                    date: sql<string>`to_char(${TrainingUnitAttempt.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
                    count: sql<number>`count(*)::int`,
                  })
                  .from(TrainingUnitAttempt)
                  .where(
                    and(
                      eq(TrainingUnitAttempt.onboardingSessionId, sessionId),
                      gte(
                        TrainingUnitAttempt.createdAt,
                        sql`now() - interval '1 year'`,
                      ),
                    ),
                  )
                  .groupBy(
                    sql`(${TrainingUnitAttempt.createdAt} at time zone 'UTC')::date`,
                  )
                  .orderBy(
                    sql`(${TrainingUnitAttempt.createdAt} at time zone 'UTC')::date`,
                  ),
              ]),
          );
          if (!version) return null;

          return {
            sessionId,
            targetIdentity: version.targetIdentity,
            motivation: version.motivation,
            hardMoments: version.hardMoments,
            unitActivity,
          };
        }),

      updateGeneralBySession: (input) =>
        Effect.gen(function* () {
          const profile = yield* query("getProfileForGeneralUpdate", (client) =>
            client.query.TrainingIdentityProfile.findFirst({
              where: eq(
                TrainingIdentityProfile.onboardingSessionId,
                input.sessionId,
              ),
            }),
          );
          if (!profile?.currentVersionId) {
            return yield* new ProfileNotFoundError({
              message: "This learning profile could not be found.",
            });
          }
          const currentVersionId = profile.currentVersionId;

          const [version] = yield* query(
            "updateGeneralProfileVersion",
            (client) =>
              client
                .update(TrainingIdentityProfileVersion)
                .set({
                  targetIdentity: input.targetIdentity,
                  motivation: input.motivation,
                  hardMoments: input.hardMoments,
                })
                .where(eq(TrainingIdentityProfileVersion.id, currentVersionId))
                .returning(),
          );
          if (!version) {
            return yield* new ProfileNotFoundError({
              message: "This learning profile could not be found.",
            });
          }

          yield* query("updateGeneralProfile", (client) =>
            client
              .update(TrainingIdentityProfile)
              .set({
                targetIdentity: input.targetIdentity,
                updatedAt: new Date(),
              })
              .where(eq(TrainingIdentityProfile.id, profile.id)),
          );

          yield* query("updateCurriculumTargetIdentity", (client) =>
            client
              .update(TrainingCurriculumPlan)
              .set({
                targetIdentity: input.targetIdentity,
                updatedAt: new Date(),
              })
              .where(
                eq(TrainingCurriculumPlan.onboardingSessionId, input.sessionId),
              ),
          );

          return {
            sessionId: input.sessionId,
            targetIdentity: version.targetIdentity,
            motivation: version.motivation,
            hardMoments: version.hardMoments,
          };
        }),

      getAccountByUserId: (userId) =>
        Effect.gen(function* () {
          const [userRecord, accountRecord] = yield* query(
            "getProfileAccount",
            (client) =>
              Promise.all([
                client.query.user.findFirst({ where: eq(user.id, userId) }),
                client.query.account.findFirst({
                  where: eq(account.userId, userId),
                }),
              ]),
          );
          if (!userRecord) {
            return yield* new ProfileNotFoundError({
              message: "Account details could not be found.",
            });
          }

          return {
            name: userRecord.name,
            email: userRecord.email,
            provider: accountRecord?.providerId ?? null,
            image: userRecord.image ?? null,
          };
        }),

      getBillingByUserId: () =>
        Effect.succeed<ProfileBilling>({ plan: "free", manageUrl: null }),
    };
  }),
);
