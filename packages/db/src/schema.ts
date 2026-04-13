import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { user } from "./auth-schema";

export const Post = pgTable("post", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const CreatePostSchema = createInsertSchema(Post, {
  title: z.string().max(256),
  content: z.string().max(256),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const EsdeDomain = pgTable("esde_domain", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  slug: t.varchar({ length: 120 }).notNull().unique(),
  title: t.varchar({ length: 160 }).notNull(),
  description: t.text().notNull(),
  unlockOrder: t.integer().notNull(),
  createdAt: t.timestamp({ mode: "date", withTimezone: true }).defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const EsdeLevel = pgTable(
  "esde_level",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    domainId: t
      .uuid()
      .notNull()
      .references(() => EsdeDomain.id, { onDelete: "cascade" }),
    slug: t.varchar({ length: 160 }).notNull().unique(),
    title: t.varchar({ length: 160 }).notNull(),
    description: t.text().notNull(),
    levelNumber: t.integer().notNull(),
    unlockOrder: t.integer().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [uniqueIndex("esde_level_domain_level_idx").on(table.domainId, table.levelNumber)],
);

export const EsdeScenario = pgTable(
  "esde_scenario",
  (t) => ({
    id: t.varchar({ length: 191 }).notNull().primaryKey(),
    levelId: t
      .uuid()
      .notNull()
      .references(() => EsdeLevel.id, { onDelete: "cascade" }),
    variantKey: t.varchar({ length: 120 }).notNull(),
    variantOrder: t.integer().notNull(),
    title: t.varchar({ length: 200 }).notNull(),
    narrative: t.text().notNull(),
    focusAreas: t.jsonb().$type<string[]>().notNull(),
    successCriteria: t.jsonb().$type<string[]>().notNull(),
    pressureModifiers: t.jsonb().$type<string[]>().notNull(),
    stageSequence: t
      .jsonb()
      .$type<Array<"educate" | "simulate" | "diagnose" | "evaluate">>()
      .notNull(),
    responseMode: t.varchar({ length: 32 }).notNull().default("typed"),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [uniqueIndex("esde_scenario_level_variant_idx").on(table.levelId, table.variantOrder)],
);

export const EsdeLevelProgress = pgTable(
  "esde_level_progress",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    domainId: t
      .uuid()
      .notNull()
      .references(() => EsdeDomain.id, { onDelete: "cascade" }),
    levelId: t
      .uuid()
      .notNull()
      .references(() => EsdeLevel.id, { onDelete: "cascade" }),
    status: t.varchar({ length: 32 }).notNull().default("in_progress"),
    currentStage: t.varchar({ length: 32 }).notNull().default("simulate"),
    activeScenarioId: t
      .varchar({ length: 191 })
      .references(() => EsdeScenario.id, { onDelete: "set null" }),
    highestScore: t.integer().notNull().default(0),
    attemptCount: t.integer().notNull().default(0),
    retryCount: t.integer().notNull().default(0),
    lastReadiness: t.varchar({ length: 32 }),
    completedAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [uniqueIndex("esde_level_progress_user_level_idx").on(table.userId, table.levelId)],
);

export const EsdeScenarioAttempt = pgTable("esde_scenario_attempt", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  domainId: t
    .uuid()
    .notNull()
    .references(() => EsdeDomain.id, { onDelete: "cascade" }),
  levelId: t
    .uuid()
    .notNull()
    .references(() => EsdeLevel.id, { onDelete: "cascade" }),
  scenarioId: t
    .varchar({ length: 191 })
    .notNull()
    .references(() => EsdeScenario.id, { onDelete: "cascade" }),
  response: t.text().notNull(),
  overallScore: t.integer().notNull(),
  readiness: t.varchar({ length: 32 }).notNull(),
  scoreBreakdown: t
    .jsonb()
    .$type<Record<string, number>>()
    .notNull(),
  failureCategories: t.jsonb().$type<string[]>().notNull(),
  strengths: t.jsonb().$type<string[]>().notNull(),
  improvements: t.jsonb().$type<string[]>().notNull(),
  repairTargets: t
    .jsonb()
    .$type<Array<{ title: string; instruction: string }>>()
    .notNull(),
  nextStage: t.varchar({ length: 32 }).notNull(),
  recommendedScenarioId: t.varchar({ length: 191 }),
  createdAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
}));

export const BecomingOnboardingSession = pgTable("becoming_onboarding_session", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t
    .text()
    .references(() => user.id, { onDelete: "set null" }),
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
}));

export const BecomingOnboardingMessage = pgTable(
  "becoming_onboarding_message",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => BecomingOnboardingSession.id, { onDelete: "cascade" }),
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

export const BecomingIdentityProfile = pgTable(
  "becoming_identity_profile",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    onboardingSessionId: t
      .uuid()
      .notNull()
      .references(() => BecomingOnboardingSession.id, { onDelete: "cascade" }),
    status: t.varchar({ length: 32 }).notNull().default("draft"),
    currentVersionId: t.uuid(),
    targetIdentity: t.varchar({ length: 240 }).notNull(),
    headline: t.text().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    uniqueIndex("becoming_identity_profile_session_idx").on(
      table.onboardingSessionId,
    ),
  ],
);

export const BecomingIdentityProfileVersion = pgTable(
  "becoming_identity_profile_version",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    profileId: t
      .uuid()
      .notNull()
      .references(() => BecomingIdentityProfile.id, { onDelete: "cascade" }),
    targetIdentity: t.varchar({ length: 240 }).notNull(),
    headline: t.text().notNull(),
    motivation: t.text().notNull(),
    currentBaseline: t.text().notNull(),
    proofOfProgress: t.text().notNull(),
    hardMoments: t.jsonb().$type<string[]>().notNull(),
    constraints: t.jsonb().$type<string[]>().notNull(),
    behaviorSignals: t.jsonb().$type<string[]>().notNull(),
    confidenceFlags: t.jsonb().$type<string[]>().notNull(),
    beforeAfterHeadline: t.text(),
    beforeStateSummary: t.text(),
    afterStateSummary: t.text(),
    beforeAfterContrastPairs: t
      .jsonb()
      .$type<Array<{ before: string; after: string }>>(),
    firstShift: t.text(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
);

export const BecomingCurriculumPlan = pgTable("becoming_curriculum_plan", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t
    .text()
    .references(() => user.id, { onDelete: "set null" }),
  onboardingSessionId: t
    .uuid()
    .notNull()
    .references(() => BecomingOnboardingSession.id, { onDelete: "cascade" }),
  profileVersionId: t
    .uuid()
    .notNull()
    .references(() => BecomingIdentityProfileVersion.id, { onDelete: "cascade" }),
  status: t.varchar({ length: 32 }).notNull().default("active"),
  title: t.varchar({ length: 240 }).notNull(),
  summary: t.text().notNull(),
  targetIdentity: t.varchar({ length: 240 }).notNull(),
  createdAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const BecomingCurriculumNode = pgTable(
  "becoming_curriculum_node",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    planId: t
      .uuid()
      .notNull()
      .references(() => BecomingCurriculumPlan.id, { onDelete: "cascade" }),
    parentNodeId: t.uuid(),
    kind: t.varchar({ length: 32 }).notNull(),
    status: t.varchar({ length: 32 }).notNull().default("planned"),
    title: t.varchar({ length: 240 }).notNull(),
    summary: t.text().notNull(),
    whyItMatters: t.text().notNull(),
    briefing: t
      .jsonb()
      .$type<{
        briefingArc: string;
        briefingMap: Array<{
          position: number;
          role: string;
        }>;
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
  ],
);

export const BecomingUnitContent = pgTable(
  "becoming_unit_content",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    nodeId: t
      .uuid()
      .notNull()
      .references(() => BecomingCurriculumNode.id, { onDelete: "cascade" }),
    title: t.varchar({ length: 240 }).notNull(),
    seedPrompt: t.text().notNull(),
    seedHint: t.text(),
    clusterArcFrame: t.text(),
    complexityBudget: t.integer().notNull().default(1),
    buildContent: t.text(),
    practicePrompts: t
      .jsonb()
      .$type<
        Array<{
          prompt: string;
          type: "identification" | "construction" | "debugging";
        }>
      >(),
    contentGeneratedAt: t.timestamp({ mode: "date", withTimezone: true }),
    teachbackSetup: t
      .jsonb()
      .$type<{
        studentPersona: string;
        openingMisconception: string;
      }>()
      .notNull(),
    scenarioTitle: t.varchar({ length: 240 }).notNull(),
    scenarioFocusAreas: t.jsonb().$type<string[]>().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [uniqueIndex("becoming_unit_content_node_idx").on(table.nodeId)],
);

export const BecomingUnitPhaseResponse = pgTable(
  "becoming_unit_phase_response",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    unitContentId: t
      .uuid()
      .notNull()
      .references(() => BecomingUnitContent.id, { onDelete: "cascade" }),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => BecomingOnboardingSession.id, { onDelete: "cascade" }),
    userId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    phase: t.varchar({ length: 32 }).notNull(),
    sequence: t.integer().notNull(),
    userResponse: t.text().notNull(),
    aiResponse: t.text(),
    passed: t.boolean(),
    score: t.integer(),
        metadata: t.jsonb().$type<
      | {
          attempts?: number;
          feedback?: string;
          step?:
            | "initial_response"
            | "mastery_check"
            | "build_response"
            | "revision";
          responseMode?: "free_response" | "multiple_choice";
          confidence?: "low" | "medium" | "high";
          latencyMs?: number | null;
          signals?: {
            correctnessBand: "strong" | "close" | "partial" | "off_track";
            misconceptionDirection: string;
            reasoningStyle: string;
          };
          stateSnapshot?: unknown;
          assessmentStatus?: "pass" | "retry_concept" | "retry_application";
          gap?: {
            description: string;
            gapType: string;
            whereItBroke: string;
          };
          evidenceAnchors?: string[];
          repairTarget?: {
            skill: string;
            transferObjective: string;
            successCriteria: string[];
          };
          ghostScenario?: {
            domain: string;
            prompt: string;
            targetDepth: number;
          };
        }
      | null
    >(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    uniqueIndex("becoming_unit_phase_response_unique_idx").on(
      table.unitContentId,
      table.sessionId,
      table.phase,
      table.sequence,
    ),
    index("becoming_unit_phase_response_session_phase_idx").on(
      table.sessionId,
      table.phase,
    ),
  ],
);

export const BecomingUnitAttempt = pgTable("becoming_unit_attempt", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  unitContentId: t
    .uuid()
    .notNull()
    .references(() => BecomingUnitContent.id, { onDelete: "cascade" }),
  onboardingSessionId: t
    .uuid()
    .notNull()
    .references(() => BecomingOnboardingSession.id, { onDelete: "cascade" }),
  userId: t
    .text()
    .references(() => user.id, { onDelete: "set null" }),
  response: t.text().notNull(),
  score: t.integer().notNull(),
  readiness: t.varchar({ length: 32 }).notNull(),
  strengths: t.jsonb().$type<string[]>().notNull(),
  improvements: t.jsonb().$type<string[]>().notNull(),
  failureTags: t.jsonb().$type<string[]>().notNull(),
  targetComparison: t.text(),
  seedResponse: t.text(),
  finalArticulation: t.text(),
  growthDimensions: t.jsonb().$type<string[]>(),
  nextStep: t.text().notNull(),
  createdAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
}));

export const BecomingCapstoneAttempt = pgTable(
  "becoming_capstone_attempt",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    simulationNodeId: t
      .uuid()
      .notNull()
      .references(() => BecomingCurriculumNode.id, { onDelete: "cascade" }),
    planId: t
      .uuid()
      .notNull()
      .references(() => BecomingCurriculumPlan.id, { onDelete: "cascade" }),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => BecomingOnboardingSession.id, { onDelete: "cascade" }),
    userId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
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
      .$onUpdateFn(() => sql`now()`),
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

export const BecomingCapstoneMessage = pgTable(
  "becoming_capstone_message",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    capstoneId: t
      .uuid()
      .notNull()
      .references(() => BecomingCapstoneAttempt.id, { onDelete: "cascade" }),
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

export const BecomingRecallGate = pgTable(
  "becoming_recall_gate",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    planId: t
      .uuid()
      .notNull()
      .references(() => BecomingCurriculumPlan.id, { onDelete: "cascade" }),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => BecomingOnboardingSession.id, { onDelete: "cascade" }),
    userId: t
      .text()
      .references(() => user.id, { onDelete: "set null" }),
    triggerAfterUnitNodeId: t
      .uuid()
      .notNull()
      .references(() => BecomingCurriculumNode.id, { onDelete: "cascade" }),
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

export const BecomingRecallProbe = pgTable(
  "becoming_recall_probe",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    gateId: t
      .uuid()
      .notNull()
      .references(() => BecomingRecallGate.id, { onDelete: "cascade" }),
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

export const BecomingUnitRecallState = pgTable(
  "becoming_unit_recall_state",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    unitNodeId: t
      .uuid()
      .notNull()
      .references(() => BecomingCurriculumNode.id, { onDelete: "cascade" }),
    planId: t
      .uuid()
      .notNull()
      .references(() => BecomingCurriculumPlan.id, { onDelete: "cascade" }),
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

export const MemoryImport = pgTable(
  "memory_import",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: t.varchar({ length: 32 }).notNull(),
    rawPayload: t.text().notNull(),
    entryCount: t.integer().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [index("memory_import_user_created_idx").on(table.userId, table.createdAt)],
);

export const Memory = pgTable(
  "memory",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: t.text().notNull(),
    source: t.varchar({ length: 32 }).notNull(),
    importId: t.uuid().references(() => MemoryImport.id, { onDelete: "set null" }),
    contentHash: t.varchar({ length: 64 }).notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    index("memory_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("memory_user_content_hash_idx").on(table.userId, table.contentHash),
  ],
);

export * from "./auth-schema";
