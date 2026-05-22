import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../../auth-schema";

export const TrainingOnboardingSession = pgTable(
  "becoming_onboarding_session",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    status: t.varchar({ length: 32 }).notNull().default("intro"),
    questionCount: t.integer().notNull().default(0),
    completedAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    index("becoming_onboarding_session_user_updated_idx").on(
      table.userId,
      table.updatedAt,
      table.createdAt,
    ),
  ],
);

export const TrainingOnboardingMessage = pgTable(
  "becoming_onboarding_message",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    role: t.varchar({ length: 16 }).notNull(),
    slot: t.varchar({ length: 32 }),
    content: t.text().notNull(),
    sequence: t.integer().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    uniqueIndex("becoming_onboarding_message_session_sequence_idx").on(
      table.sessionId,
      table.sequence,
    ),
  ],
);
