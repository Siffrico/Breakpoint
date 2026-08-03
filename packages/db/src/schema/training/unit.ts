import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import type {
  EducationExperienceSnapshot,
  UnitCapabilityTodo,
  UnitDifficultySnapshot,
  UnitMasteryContract,
  UnitReviewChallenge,
} from "@acme/validators";

import { user } from "../../auth-schema";
import { TrainingCurriculumNode } from "./curriculum";
import { TrainingOnboardingSession } from "./onboarding";

/**
 * @deprecated Use `UnitDifficultySnapshot` from `@acme/validators` directly.
 * Kept as an alias so the persisted contract has one canonical definition and
 * cannot drift from the API engine's rating model.
 */
export type TrainingUnitDifficultySnapshotJson = UnitDifficultySnapshot;

export type TrainingUnitMasteryContractJson = UnitMasteryContract;

export const TrainingUnitContent = pgTable(
  "becoming_unit_content",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    nodeId: t
      .uuid()
      .notNull()
      .references(() => TrainingCurriculumNode.id, { onDelete: "cascade" }),
    title: t.varchar({ length: 240 }).notNull(),
    seedPrompt: t.text().notNull(),
    seedHint: t.text(),
    clusterArcFrame: t.text(),
    complexityBudget: t.integer().notNull().default(1),
    buildContent: t.text(),
    practicePrompts: t.jsonb().$type<
      {
        prompt: string;
        type: "identification" | "construction" | "debugging";
      }[]
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
    unitMasteryContractJson: t
      .jsonb()
      .$type<TrainingUnitMasteryContractJson | null>(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [uniqueIndex("becoming_unit_content_node_idx").on(table.nodeId)],
);

export const TrainingUnitPhaseResponse = pgTable(
  "becoming_unit_phase_response",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    unitContentId: t
      .uuid()
      .notNull()
      .references(() => TrainingUnitContent.id, { onDelete: "cascade" }),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    phase: t.varchar({ length: 32 }).notNull(),
    sequence: t.integer().notNull(),
    userResponse: t.text().notNull(),
    aiResponse: t.text(),
    passed: t.boolean(),
    score: t.integer(),
    metadata: t.jsonb().$type<{
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
      aiEducationStage?: "learning" | "review" | "complete";
      recallUnitId?: string;
      promptKind?: "education_unit" | "recall";
      modelPurpose?: string;
      verdict?: string;
      evaluationSummary?: string;
      failedDimensions?: string[];
      dimensionResults?: {
        dimensionId: string;
        score: number;
        evidence: string;
        missing: string | null;
      }[];
      scenarioAttemptId?: string;
      recallEntryIds?: string[];
      manualDifficultySignal?: "too_easy" | "too_hard";
      difficultyDirectiveReason?: string;
      goldilocksUpdated?: boolean;
      estimatedItemRating?: number;
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
    } | null>(),
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

export const TrainingUnitRun = pgTable(
  "becoming_unit_run",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    unitContentId: t
      .uuid()
      .notNull()
      .references(() => TrainingUnitContent.id, { onDelete: "cascade" }),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    kind: t.varchar({ length: 24 }).notNull().default("education"),
    mode: t.varchar({ length: 24 }).notNull().default("learning"),
    experienceId: t
      .varchar({ length: 96 })
      .notNull()
      .default("breakpoint-mentor"),
    experienceVersion: t.integer().notNull().default(1),
    experienceJson: t.jsonb().$type<EducationExperienceSnapshot>().notNull(),
    masteryContractJson: t.jsonb().$type<UnitMasteryContract>().notNull(),
    capabilityTodosJson: t.jsonb().$type<UnitCapabilityTodo[]>().notNull(),
    activeReviewChallengeJson: t.jsonb().$type<UnitReviewChallenge | null>(),
    reviewerFeedback: t.text(),
    hasReviewGrade: t.boolean().notNull().default(false),
    difficultySnapshotJson: t
      .jsonb()
      .$type<TrainingUnitDifficultySnapshotJson | null>(),
    turnLeaseId: t.uuid(),
    turnLeaseExpiresAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    uniqueIndex("becoming_unit_run_session_unit_kind_idx").on(
      table.sessionId,
      table.unitContentId,
      table.kind,
    ),
    index("becoming_unit_run_session_idx").on(table.sessionId),
  ],
);

export const TrainingUnitAttempt = pgTable("becoming_unit_attempt", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  unitContentId: t
    .uuid()
    .notNull()
    .references(() => TrainingUnitContent.id, { onDelete: "cascade" }),
  onboardingSessionId: t
    .uuid()
    .notNull()
    .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
  userId: t.text().references(() => user.id, { onDelete: "set null" }),
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
