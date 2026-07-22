import { sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import type { ScenarioArchetype } from "@acme/validators";

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
    // Glicko seed derived from the learner's onboarding starting point and
    // stamped at build time. The workspace reads it as the initial rating state
    // for fresh nodes. Null when no starting point was elicited. See
    // @acme/validators SeedRating and engine/rating/seed.ts.
    seedRating: t.jsonb().$type<{
      rating: number;
      ratingDeviation: number;
      volatility: number;
    } | null>(),
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
    // `ability` nodes always have a stage; structural and skill/unit nodes never do.
    abilityStage: t.varchar({ length: 16 }),
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
      scenarioArchetype: ScenarioArchetype;
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
    check(
      "becoming_curriculum_node_v4_shape",
      sql`(
        (
          kind = 'ability'
          and ability_stage is not null
          and ability_stage in ('foundations', 'skillset', 'mastered')
        )
        or (kind <> 'ability' and ability_stage is null)
      )
      and kind in ('root', 'ability', 'skill', 'unit')
      and (
        (
          kind in ('ability', 'skill')
          and skill_map is not null
          and coalesce(skill_map ->> 'scenarioArchetype', '') in ('select', 'transform', 'judge')
          and not (skill_map ? 'scenarioFormats')
        )
        or (kind in ('root', 'unit') and skill_map is null)
      )`,
    ),
  ],
);

export const TrainingKnowledgeQuestion = pgTable(
  "becoming_knowledge_question",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    skillNodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    orderIndex: t.integer().notNull(),
    question: t.text().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    uniqueIndex("becoming_knowledge_question_skill_order_idx").on(
      table.skillNodeId,
      table.orderIndex,
    ),
  ],
);

export const TrainingKnowledgeItem = pgTable(
  "becoming_knowledge_item",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    questionId: t
      .uuid()
      .notNull()
      .references(() => TrainingKnowledgeQuestion.id, { onDelete: "cascade" }),
    orderIndex: t.integer().notNull(),
    kind: t.varchar({ length: 32 }).notNull(),
    label: t.text().notNull(),
    content: t.text().notNull(),
    // How many scored solves this item was load-bearing in. Skill mastery
    // requires every item to reach the coverage target (see
    // engine/concept-coverage.ts) — never a drifting rating.
    coverageCount: t.integer().notNull().default(0),
    status: t.varchar({ length: 32 }).notNull().default("unchecked"),
    checkedAt: t.timestamp({ mode: "date", withTimezone: true }),
    // Spaced-reinforcement state: how many consecutive scored recalls this
    // item has survived, and when it last earned (or lost) one. checkedAt is
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
    uniqueIndex("becoming_knowledge_item_question_order_idx").on(
      table.questionId,
      table.orderIndex,
    ),
    index("becoming_knowledge_item_evidence_node_idx").on(table.evidenceNodeId),
    check(
      "becoming_knowledge_item_kind",
      sql`${table.kind} in ('concept', 'mechanism')`,
    ),
  ],
);
