import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../../auth-schema";
import { TrainingCurriculumNode, TrainingCurriculumPlan } from "./curriculum";
import { TrainingOnboardingSession } from "./onboarding";

export const TrainingCapstoneAttempt = pgTable(
  "becoming_capstone_attempt",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    simulationNodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    planId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumPlan.id, { onDelete: "cascade" }),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    format: t.varchar({ length: 16 }).notNull(),
    status: t.varchar({ length: 16 }).notNull().default("pending"),
    scenario: t
      .jsonb()
      .$type<
        | {
            format: "build";
            title: string;
            artifactType: string;
            briefing: string;
            constraints: string[];
            evaluationCriteria: string[];
          }
        | {
            format: "debate";
            title: string;
            resolution: string;
            context: string;
            aiPosition: string;
            openingArgument: string;
          }
        | {
            format: "teach";
            title: string;
            audience: string;
            audienceContext: string;
            deliveryGoal: string;
            openingQuestion: string;
          }
      >()
      .notNull(),
    currentRound: t.integer().notNull().default(0),
    maxRounds: t.integer().notNull(),
    score: t.integer(),
    feedback: t.text(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("becoming_capstone_attempt_simulation_session_idx").on(
      table.simulationNodeId,
      table.sessionId,
    ),
    index("becoming_capstone_attempt_session_status_idx").on(
      table.sessionId,
      table.status,
    ),
  ],
);

export const TrainingCapstoneMessage = pgTable(
  "becoming_capstone_message",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    capstoneId: t
      .uuid()
      .notNull()
      .references(() => TrainingCapstoneAttempt.id, { onDelete: "cascade" }),
    role: t.varchar({ length: 16 }).notNull(),
    content: t.text().notNull(),
    sequence: t.integer().notNull(),
    round: t.integer().notNull().default(0),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    uniqueIndex("becoming_capstone_message_unique_idx").on(
      table.capstoneId,
      table.sequence,
    ),
    index("becoming_capstone_message_round_idx").on(table.capstoneId, table.round),
  ],
);
