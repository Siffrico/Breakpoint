import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../auth-schema";

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
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("memory_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("memory_user_content_hash_idx").on(table.userId, table.contentHash),
  ],
);
