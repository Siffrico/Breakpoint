import { sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import type {
  RecallCommittedResponse,
  RecallCorrectionRecord,
  RecallFirstRetrievalPersistence,
  RecallKnowledgeSnapshot,
  RecallScenario,
} from "@acme/validators";

import { user } from "../../auth-schema";
import { TrainingCurriculumNode, TrainingCurriculumPlan } from "./curriculum";
import { TrainingOnboardingSession } from "./onboarding";

export const TrainingRecallGate = pgTable(
  "becoming_recall_gate",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    planId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumPlan.id, { onDelete: "cascade" }),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    triggerAfterUnitNodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    status: t.varchar({ length: 32 }).notNull().default("pending"),
    completedAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("becoming_recall_gate_plan_trigger_idx").on(
      table.planId,
      table.triggerAfterUnitNodeId,
    ),
    index("becoming_recall_gate_session_status_idx").on(
      table.sessionId,
      table.status,
    ),
  ],
);

export const TrainingRecallProbe = pgTable(
  "becoming_recall_probe",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    gateId: t
      .uuid()
      .notNull()
      .references(() => TrainingRecallGate.id, { onDelete: "cascade" }),
    probeOrder: t.integer().notNull(),
    probeType: t.varchar({ length: 32 }).notNull(),
    sourceUnitNodeIds: t.jsonb().$type<string[]>().notNull(),
    prompt: t.text().notNull(),
    seedSnapshot: t.text(),
    userResponse: t.text(),
    score: t.integer(),
    passed: t.boolean(),
    repairPrompt: t.text(),
    repairResponse: t.text(),
    repairScore: t.integer(),
    repairPassed: t.boolean(),
    status: t.varchar({ length: 32 }).notNull().default("pending"),
    completedAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("becoming_recall_probe_gate_order_idx").on(
      table.gateId,
      table.probeOrder,
    ),
    index("becoming_recall_probe_gate_status_idx").on(
      table.gateId,
      table.status,
    ),
  ],
);

export const TrainingUnitRecallState = pgTable(
  "becoming_unit_recall_state",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    unitNodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    planId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumPlan.id, { onDelete: "cascade" }),
    lastRecalledAt: t.timestamp({ mode: "date", withTimezone: true }),
    lastRecallOrderIndex: t.integer(),
    recallCount: t.integer().notNull().default(0),
    decayCount: t.integer().notNull().default(0),
    lastRecallScore: t.integer(),
    status: t.varchar({ length: 32 }).notNull().default("retained"),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("becoming_unit_recall_state_unit_plan_idx").on(
      table.unitNodeId,
      table.planId,
    ),
    index("becoming_unit_recall_state_plan_status_idx").on(
      table.planId,
      table.status,
    ),
  ],
);

export const TrainingRecallTask = pgTable(
  "becoming_recall_task",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumPlan.id, { onDelete: "restrict" }),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    knowledgeItemId: t.uuid(),
    originalTeachingUnitNodeId: t.uuid(),
    strengthAtReservation: t.integer().notNull(),
    knowledgeSnapshotJson: t.jsonb().$type<RecallKnowledgeSnapshot>().notNull(),
    scenarioJson: t.jsonb().$type<RecallScenario>(),
    state: t.varchar({ length: 24 }).notNull().default("preparing"),
    interactionId: t.uuid(),
    currentQuestion: t.text(),
    firstRetrievalJson: t.jsonb().$type<RecallFirstRetrievalPersistence>(),
    correctionHistoryJson: t
      .jsonb()
      .$type<RecallCorrectionRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    preparationLeaseId: t.uuid(),
    preparationLeaseExpiresAt: t.timestamp({
      mode: "date",
      withTimezone: true,
    }),
    turnLeaseId: t.uuid(),
    turnLeaseExpiresAt: t.timestamp({ mode: "date", withTimezone: true }),
    lastOfferedBoundaryNodeId: t.uuid(),
    pausedAt: t.timestamp({ mode: "date", withTimezone: true }),
    completedAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    check(
      "becoming_recall_task_state_check",
      sql`${table.state} in ('preparing', 'ready', 'retrieving', 'correcting', 'complete')`,
    ),
    uniqueIndex("becoming_recall_task_one_unfinished_plan_idx")
      .on(table.planId)
      .where(sql`${table.state} <> 'complete'`),
    index("becoming_recall_task_owner_session_state_idx").on(
      table.userId,
      table.sessionId,
      table.state,
    ),
    index("becoming_recall_task_preparation_lease_idx").on(
      table.state,
      table.preparationLeaseExpiresAt,
    ),
  ],
);

export const TrainingRecallSubmission = pgTable(
  "becoming_recall_submission",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    taskId: t
      .uuid()
      .notNull()
      .references(() => TrainingRecallTask.id, { onDelete: "cascade" }),
    requestId: t.uuid().notNull(),
    interactionId: t.uuid().notNull(),
    answer: t.text().notNull(),
    status: t.varchar({ length: 24 }).notNull().default("processing"),
    leaseId: t.uuid(),
    leaseExpiresAt: t.timestamp({ mode: "date", withTimezone: true }),
    responseJson: t.jsonb().$type<RecallCommittedResponse>(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    check(
      "becoming_recall_submission_status_check",
      sql`${table.status} in ('processing', 'committed', 'failed')`,
    ),
    uniqueIndex("becoming_recall_submission_task_request_idx").on(
      table.taskId,
      table.requestId,
    ),
    uniqueIndex("becoming_recall_submission_task_interaction_idx").on(
      table.taskId,
      table.interactionId,
    ),
    index("becoming_recall_submission_lease_idx").on(
      table.status,
      table.leaseExpiresAt,
    ),
  ],
);
