import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import type {
  MissionPlan,
  MissionProof,
  MissionSpec,
  MissionStatus,
} from "@acme/validators";

import { user } from "../../auth-schema";
import { TrainingUnitRun } from "./unit";

export const TrainingMission = pgTable(
  "becoming_mission",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    unitRunId: t
      .uuid()
      .notNull()
      .references(() => TrainingUnitRun.id, { onDelete: "cascade" }),
    status: t
      .varchar({ length: 16 })
      .$type<MissionStatus>()
      .notNull()
      .default("drafting"),
    spec: t.jsonb().$type<MissionSpec | null>(),
    plan: t.jsonb().$type<MissionPlan | null>(),
    proof: t.jsonb().$type<MissionProof | null>(),
    debrief: t.text(),
    messages: t.jsonb().$type<unknown[]>().notNull().default([]),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [uniqueIndex("becoming_mission_unit_run_idx").on(table.unitRunId)],
);
