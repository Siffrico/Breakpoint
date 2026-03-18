import { sql } from "drizzle-orm";
import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
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

export * from "./auth-schema";
