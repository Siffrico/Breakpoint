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
    // Curriculum node id of the unit this message belongs to. Null for
    // pre-unit messages (onboarding/intro), which compaction treats as the
    // oldest bucket. See engine/compaction.
    unitId: t.uuid(),
    turnId: t.varchar({ length: 96 }),
    content: t.text().notNull(),
    metadata: t.jsonb().$type<{
      difficultyDirectiveReason?: string;
    } | null>(),
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
    uniqueIndex("becoming_onboarding_message_session_turn_role_idx")
      .on(table.sessionId, table.turnId, table.role)
      .where(sql`${table.turnId} is not null`),
  ],
);

/**
 * Rolling "progress" summary for a long-lived project chat, keyed per
 * (session, slot) because the workspace feeds the model a slot-filtered
 * transcript. Holds the anchored summary of units that have aged out of the
 * verbatim window. See engine/compaction.
 */
export const TrainingWorkspaceSummary = pgTable(
  "becoming_workspace_summary",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    slot: t.varchar({ length: 32 }).notNull(),
    summary: t.text().notNull(),
    // Anchor: unitId of the newest unit folded into `summary`. Lets the next
    // turn explain what the summary covers.
    coveredThroughUnitId: t.uuid(),
    // Durable cursor for compaction. Unlike unitId, sequence is non-null for
    // all persisted messages, including legacy/pre-unit messages.
    coveredThroughSequence: t.integer(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    uniqueIndex("becoming_workspace_summary_session_slot_idx").on(
      table.sessionId,
      table.slot,
    ),
  ],
);
