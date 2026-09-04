import { index, pgTable } from "drizzle-orm/pg-core";

import type {
  WorkspaceModelAttemptMetric,
  WorkspaceTurnTimingMetric,
} from "@acme/validators";

import { TrainingOnboardingSession } from "./training/onboarding";

export const WorkspaceTurnPerformance = pgTable(
  "workspace_turn_performance",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => TrainingOnboardingSession.id, { onDelete: "cascade" }),
    turnId: t.varchar({ length: 96 }).notNull(),
    action: t.varchar({ length: 32 }).notNull(),
    educationStage: t.varchar({ length: 32 }),
    outcome: t.varchar({ length: 24 }).notNull(),
    errorTag: t.varchar({ length: 96 }),
    release: t.varchar({ length: 128 }),
    timings: t.jsonb().$type<WorkspaceTurnTimingMetric>().notNull(),
    modelAttempts: t.jsonb().$type<WorkspaceModelAttemptMetric[]>().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    index("workspace_turn_performance_created_idx").on(table.createdAt),
    index("workspace_turn_performance_outcome_created_idx").on(
      table.outcome,
      table.createdAt,
    ),
    index("workspace_turn_performance_session_turn_idx").on(
      table.sessionId,
      table.turnId,
    ),
  ],
);

export const WebVitalPerformance = pgTable(
  "web_vital_performance",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    route: t.varchar({ length: 512 }).notNull(),
    name: t.varchar({ length: 16 }).notNull(),
    value: t.doublePrecision().notNull(),
    delta: t.doublePrecision().notNull(),
    rating: t.varchar({ length: 24 }).notNull(),
    navigationType: t.varchar({ length: 32 }).notNull(),
    release: t.varchar({ length: 128 }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (table) => [
    index("web_vital_performance_created_idx").on(table.createdAt),
    index("web_vital_performance_name_created_idx").on(
      table.name,
      table.createdAt,
    ),
    index("web_vital_performance_route_created_idx").on(
      table.route,
      table.createdAt,
    ),
  ],
);
