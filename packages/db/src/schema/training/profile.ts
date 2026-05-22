import { sql } from "drizzle-orm";
import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../../auth-schema";
import { TrainingOnboardingSession } from "./onboarding";

export const TrainingIdentityProfile = pgTable(
  "becoming_identity_profile",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    onboardingSessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    status: t.varchar({ length: 32 }).notNull().default("draft"),
    currentVersionId: t.uuid(),
    targetIdentity: t.varchar({ length: 240 }).notNull(),
    headline: t.text().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    uniqueIndex("becoming_identity_profile_session_idx").on(
      table.onboardingSessionId,
    ),
  ],
);

export const TrainingIdentityProfileVersion = pgTable(
  "becoming_identity_profile_version",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    profileId: t
      .uuid()
      .notNull()
      .references(() => TrainingIdentityProfile.id, { onDelete: "cascade" }),
    targetIdentity: t.varchar({ length: 240 }).notNull(),
    headline: t.text().notNull(),
    motivation: t.text().notNull(),
    currentBaseline: t.text().notNull(),
    proofOfProgress: t.text().notNull(),
    hardMoments: t.jsonb().$type<string[]>().notNull(),
    constraints: t.jsonb().$type<string[]>().notNull(),
    behaviorSignals: t.jsonb().$type<string[]>().notNull(),
    confidenceFlags: t.jsonb().$type<string[]>().notNull(),
    beforeAfterHeadline: t.text(),
    beforeStateSummary: t.text(),
    afterStateSummary: t.text(),
    beforeAfterContrastPairs: t
      .jsonb()
      .$type<Array<{ before: string; after: string }>>(),
    firstShift: t.text(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
);
