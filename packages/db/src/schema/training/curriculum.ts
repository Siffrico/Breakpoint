import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../../auth-schema";
import { TrainingOnboardingSession } from "./onboarding";
import { TrainingIdentityProfileVersion } from "./profile";

export const TrainingCurriculumPlan = pgTable(
  "becoming_curriculum_plan",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    onboardingSessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    // Nullable on purpose: the plan shell is created the instant the learner
    // approves (status "generating"), before the curriculum agent has produced
    // the identity report the profile version is derived from. It is linked once
    // the curriculum artifact persists. See domain/training/orchestration.
    profileVersionId: t
      .uuid()
      .references(() => TrainingIdentityProfileVersion.id, {
        onDelete: "cascade",
      }),
    // "generating" while the build fills the shell, "active" once the curriculum
    // (the required artifact) has landed. Free-form varchar — no enum migration.
    status: t.varchar({ length: 32 }).notNull().default("active"),
    title: t.varchar({ length: 240 }).notNull(),
    summary: t.text().notNull(),
    targetIdentity: t.varchar({ length: 240 }).notNull(),
    overview: t.jsonb().$type<{
      title: string;
      summary: string;
      body: string;
    }>(),
    overviewGeneratedAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("becoming_curriculum_plan_session_idx").on(
      table.onboardingSessionId,
    ),
  ],
);

export const TrainingCurriculumNode = pgTable(
  "becoming_curriculum_node",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    planId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumPlan.id, { onDelete: "cascade" }),
    parentNodeId: t.uuid(),
    kind: t.varchar({ length: 32 }).notNull(),
    status: t.varchar({ length: 32 }).notNull().default("planned"),
    title: t.varchar({ length: 240 }).notNull(),
    summary: t.text().notNull(),
    whyItMatters: t.text().notNull(),
    briefing: t.jsonb().$type<{
      briefingArc: string;
      briefingMap: {
        position: number;
        role: string;
      }[];
    }>(),
    difficultyBands: t.jsonb().$type<
      {
        order: number;
        minRating: number;
        maxRating: number;
        label?: string;
      }[]
    >(),
    skillMap: t.jsonb().$type<{
      workflow: { name: string; steps: string[] };
      bandRamp: { startRating: number; peakRating: number };
      masteryContract: {
        exitCriteria: string[];
        maxRatingDeviation?: number;
      };
    }>(),
    orderIndex: t.integer().notNull(),
    depth: t.integer().notNull(),
    positionColumn: t.integer().notNull(),
    positionRow: t.integer().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    uniqueIndex("becoming_curriculum_node_plan_order_idx").on(
      table.planId,
      table.orderIndex,
    ),
    index("becoming_curriculum_node_parent_order_idx").on(
      table.parentNodeId,
      table.orderIndex,
    ),
  ],
);

export const TrainingSyllabusEntry = pgTable(
  "becoming_training_syllabus_entry",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    clusterNodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    orderIndex: t.integer().notNull(),
    label: t.text().notNull(),
    kind: t.varchar({ length: 32 }).notNull(),
    gloss: t.text().notNull(),
    status: t.varchar({ length: 32 }).notNull().default("unchecked"),
    checkedAt: t.timestamp({ mode: "date", withTimezone: true }),
    // Spaced-reinforcement state: how many consecutive scored recalls this
    // entry has survived, and when it last earned (or lost) one. checkedAt is
    // the anchor until the first reinforcement. See policies/recall-decay.ts.
    strength: t.integer().notNull().default(0),
    lastReinforcedAt: t.timestamp({ mode: "date", withTimezone: true }),
    evidenceNodeId: t
      .uuid()
      .references(() => TrainingCurriculumNode.id, { onDelete: "set null" }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    uniqueIndex("becoming_syllabus_cluster_order_idx").on(
      table.clusterNodeId,
      table.orderIndex,
    ),
    index("becoming_syllabus_evidence_node_idx").on(table.evidenceNodeId),
  ],
);
