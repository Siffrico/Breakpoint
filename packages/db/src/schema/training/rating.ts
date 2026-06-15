import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../../auth-schema";
import { TrainingCurriculumNode } from "./curriculum";

export type TrainingSupportLevel = "worked_example" | "guided" | "none";

export interface TrainingRecentAttemptJson {
  bandOrder: number;
  offeredSupport: TrainingSupportLevel;
  itemRating: number;
  score: number;
  outcome: number;
  effectiveSupport: TrainingSupportLevel;
  cleanPass: boolean;
  pass: boolean;
  hardFail: boolean;
  occurredAt: string;
}

export interface TrainingScenarioDirectiveJson {
  intent:
    | "repair"
    | "probe"
    | "back_off"
    | "promote"
    | "fade_support"
    | "challenge"
    | "mastered";
  bandOrder: number;
  supportLevel: TrainingSupportLevel;
  targetItemRating: number;
  targetMisconceptionCode: string | null;
  reason: string;
  nextProgress: {
    bandOrder: number;
    supportLevel: TrainingSupportLevel;
  };
}

export const TrainingJobProgress = pgTable(
  "becoming_training_job_progress",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    rating: t.doublePrecision().notNull(),
    ratingDeviation: t.doublePrecision().notNull(),
    volatility: t.doublePrecision().notNull(),
    lastRatedAt: t.timestamp({ mode: "date", withTimezone: true }),
    bandOrder: t.integer().notNull().default(0),
    supportLevel: t.varchar({ length: 32 }).notNull().default("worked_example"),
    recentAttemptsJson: t
      .jsonb()
      .$type<TrainingRecentAttemptJson[]>()
      .notNull()
      .default([]),
    masteredAt: t.timestamp({ mode: "date", withTimezone: true }),
  }),
  (table) => [
    uniqueIndex("becoming_training_job_progress_user_node_idx").on(
      table.userId,
      table.nodeId,
    ),
    index("becoming_training_job_progress_node_idx").on(table.nodeId),
  ],
);

export const TrainingMisconception = pgTable(
  "becoming_training_misconception",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    code: t.varchar({ length: 160 }).notNull(),
    status: t.varchar({ length: 32 }).notNull(),
    occurrences: t.integer().notNull().default(1),
    lastSeenAt: t.timestamp({ mode: "date", withTimezone: true }).notNull(),
  }),
  (table) => [
    uniqueIndex("becoming_training_misconception_user_node_code_idx").on(
      table.userId,
      table.nodeId,
      table.code,
    ),
    index("becoming_training_misconception_node_status_idx").on(
      table.nodeId,
      table.status,
    ),
  ],
);

export const TrainingRatingPrediction = pgTable(
  "becoming_training_rating_prediction",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    ratingBefore: t.doublePrecision().notNull(),
    ratingDeviationBefore: t.doublePrecision().notNull(),
    ratingAfter: t.doublePrecision().notNull(),
    ratingDeviationAfter: t.doublePrecision().notNull(),
    itemRating: t.doublePrecision().notNull(),
    predictedScore: t.doublePrecision().notNull(),
    actualOutcome: t.doublePrecision().notNull(),
    occurredAt: t.timestamp({ mode: "date", withTimezone: true }).notNull(),
  }),
  (table) => [
    index("becoming_training_rating_prediction_user_node_time_idx").on(
      table.userId,
      table.nodeId,
      table.occurredAt,
    ),
  ],
);

export const TrainingScenarioAttempt = pgTable(
  "becoming_training_scenario_attempt",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    status: t.varchar({ length: 32 }).notNull().default("open"),
    directiveJson: t.jsonb().$type<TrainingScenarioDirectiveJson>().notNull(),
    itemRating: t.doublePrecision().notNull(),
    targetMisconceptionCode: t.varchar({ length: 160 }),
    supportLevel: t.varchar({ length: 32 }).notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    evaluatedAt: t.timestamp({ mode: "date", withTimezone: true }),
  }),
  (table) => [
    index("becoming_training_scenario_attempt_open_idx").on(
      table.userId,
      table.nodeId,
      table.status,
      table.createdAt,
    ),
  ],
);
