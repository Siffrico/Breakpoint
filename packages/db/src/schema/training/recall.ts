import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

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
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    uniqueIndex("becoming_recall_gate_plan_trigger_idx").on(
      table.planId,
      table.triggerAfterUnitNodeId,
    ),
    index("becoming_recall_gate_session_status_idx").on(table.sessionId, table.status),
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
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    uniqueIndex("becoming_recall_probe_gate_order_idx").on(
      table.gateId,
      table.probeOrder,
    ),
    index("becoming_recall_probe_gate_status_idx").on(table.gateId, table.status),
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
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    uniqueIndex("becoming_unit_recall_state_unit_plan_idx").on(
      table.unitNodeId,
      table.planId,
    ),
    index("becoming_unit_recall_state_plan_status_idx").on(table.planId, table.status),
  ],
);
