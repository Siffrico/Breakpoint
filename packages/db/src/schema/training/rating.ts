import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import type { ScenarioDirective, SupportLevel } from "@acme/validators";

import { user } from "../../auth-schema";
import { TrainingCurriculumNode } from "./curriculum";
import { TrainingUnitRun } from "./unit";

/**
 * @deprecated Alias of the canonical `SupportLevel` from `@acme/validators`.
 * Kept so persisted rating shapes share one source of truth with the engine.
 */
export type TrainingSupportLevel = SupportLevel;

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

/**
 * @deprecated Alias of the canonical `ScenarioDirective` from
 * `@acme/validators`. Kept so the persisted `directiveJson` column shares one
 * source of truth with the API rating engine.
 */
export type TrainingScenarioDirectiveJson = ScenarioDirective;

export interface TrainingScenarioEvaluationContractJson {
  version: 1;
  scenarioStage: "connect" | "solve" | "recall";
  scenarioPromptSummary: string;
  testedDimensions: {
    dimensionId: string;
    promptRole: string;
    expectedStrongMoves: string[];
    acceptableVariants: string[];
    commonWrongMoves: string[];
    scoreBands: {
      strong: string;
      partial: string;
      weak: string;
    };
  }[];
  learnerVisibleCriteria: string[];
  evaluatorNotes: string[];
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
    scenarioPrompt: t.text(),
    scenarioContractJson: t
      .jsonb()
      .$type<TrainingScenarioEvaluationContractJson | null>(),
    contractVersion: t.integer(),
    itemRating: t.doublePrecision().notNull(),
    targetMisconceptionCode: t.varchar({ length: 160 }),
    supportLevel: t.varchar({ length: 32 }).notNull(),
    /** Present only for education-unit and recall attempts. */
    unitRunId: t
      .uuid()
      .references(() => TrainingUnitRun.id, { onDelete: "cascade" }),
    originTurnId: t.varchar({ length: 96 }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    presentedAt: t.timestamp({ mode: "date", withTimezone: true }),
    solvePresentedAt: t.timestamp({ mode: "date", withTimezone: true }),
    solvePromptTurnId: t.varchar({ length: 96 }),
    evaluatedAt: t.timestamp({ mode: "date", withTimezone: true }),
  }),
  (table) => [
    index("becoming_training_scenario_attempt_open_idx").on(
      table.userId,
      table.nodeId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex("becoming_training_scenario_attempt_run_turn_idx").on(
      table.unitRunId,
      table.originTurnId,
    ),
  ],
);
