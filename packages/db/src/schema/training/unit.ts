import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../../auth-schema";
import { TrainingCurriculumNode } from "./curriculum";
import { TrainingOnboardingSession } from "./onboarding";

export interface TrainingUnitMasteryContractJson {
  version: 1;
  dimensions: {
    id: string;
    name: string;
    description: string;
    passSignals: string[];
    failSignals: string[];
    surrogateTraps: string[];
  }[];
}

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
      .$onUpdateFn(() => sql`now()`),
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
      aiEducationStage?:
        | "diagnostic_scenario"
        | "concept_instruction"
        | "guided_application"
        | "performance_evaluation"
        | "transfer_scenario"
        | "completed";
      recallUnitId?: string;
      promptKind?:
        | "onboarding_curriculum"
        | "education_unit"
        | "recall"
        | "evaluate_feedback";
      modelPurpose?: string;
      routingDecision?: "pass" | "retry" | "repair";
      evaluationSummary?: string;
      failedDimensions?: string[];
      dimensionResults?: {
        dimensionId: string;
        score: number;
        evidence: string;
        missing: string | null;
      }[];
      evaluationPlan?: {
        mode: "intuition_sprint" | "deep_reasoning" | "standard";
        scenarioCount: 1 | 2 | 3;
        timeLimitSeconds: 30 | 45 | 60 | 300 | 600;
        feedbackMode: "full_after_each";
        reason: string;
      };
      attemptTiming?: {
        elapsedSeconds: number;
        timeLimitSeconds: number;
        overrunSeconds: number;
        wasOverTime: boolean;
        pausedSeconds?: number;
      };
      nextScenarioPrompt?: boolean;
      manualDifficultySignal?: "too_easy" | "too_hard";
      difficultyDirectiveReason?: string;
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
    workflowId: t.varchar({ length: 96 }).notNull(),
    currentStepId: t.varchar({ length: 96 }).notNull(),
    stepScenarioCount: t.integer().notNull().default(0),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    uniqueIndex("becoming_unit_run_session_unit_idx").on(
      table.sessionId,
      table.unitContentId,
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
