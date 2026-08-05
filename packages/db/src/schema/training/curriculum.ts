import { sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import type { ScenarioArchetype, ScenarioBrief } from "@acme/validators";

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
    // Copied from the onboarding session at shell creation and never changed:
    // the node tree beneath this plan has the shape this mode produced, so a
    // plan built in one mode can never be reinterpreted as the other.
    // See @acme/validators CurriculumModeSchema.
    curriculumMode: t.varchar({ length: 24 }).notNull().default("ability"),
    // Topic mode only: how the outcome nodes are sequenced, decided by the
    // curriculum designer. Null on ability-mode plans.
    // See @acme/validators OutcomeOrderingSchema.
    outcomeOrdering: t.varchar({ length: 16 }),
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
    // Which child skill this unit is a rep OF. Set only on skillset units (whose
    // parent is an ability); null on every other kind, and on foundation units,
    // whose owning skill is already their parent. The interleaving round-robin
    // counts reps per skill off this column — it cannot be derived from the
    // knowledge items' evidenceNodeId, because a later unit re-targeting the
    // same item overwrites the earlier unit's stamp and loses the rep.
    practicedSkillNodeId: t.uuid(),
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
      // Outcome nodes only: the main outcome every task beneath this node is
      // judged against, plus the contract for building a well-formed task.
      // Absent on ability/skill nodes.
      mainOutcome?: string;
      scenarioBrief?: ScenarioBrief;
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
    // The rep-count read is "completed units under this ability, by skill".
    index("becoming_curriculum_node_practiced_skill_idx").on(
      table.parentNodeId,
      table.practicedSkillNodeId,
    ),
    // Shape invariant for both curriculum modes. `outcome` nodes (topic mode)
    // behave like abilities in that they carry a skill map and own a rating,
    // but they have no foundations→skillset progression, so their stage stays
    // null. Keeping this strict is deliberate: a writer that produces a
    // malformed node fails here rather than running as a degraded legacy node.
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
      and kind in ('root', 'ability', 'skill', 'unit', 'outcome')
      and (
        (
          kind in ('ability', 'skill', 'outcome')
          and skill_map is not null
          and coalesce(skill_map ->> 'scenarioArchetype', '') in ('select', 'transform', 'judge')
          and not (skill_map ? 'scenarioFormats')
        )
        or (kind in ('root', 'unit') and skill_map is null)
      )
      and (kind = 'outcome' or not (skill_map ? 'mainOutcome'))`,
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
