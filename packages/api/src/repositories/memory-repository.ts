import { and, desc, eq, inArray } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import { Memory as MemoryTable } from "@acme/db/schema";

import type { Memory, MemoryError, MemorySource } from "../domain/memory/types";
import { type Result } from "../lib/result";

type Database = typeof databaseClient;

const mapMemory = (record: typeof MemoryTable.$inferSelect): Memory => ({
  id: record.id,
  content: record.content,
  source: record.source as MemorySource,
  importId: record.importId,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt ?? null,
});

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "23505";

export const memoryRepository = {
  listByUserId: async ({
    db,
    userId,
  }: {
    db: Database;
    userId: string;
  }): Promise<Result<Memory[], MemoryError>> => {
    try {
      const records = await db.query.Memory.findMany({
        where: eq(MemoryTable.userId, userId),
        orderBy: [desc(MemoryTable.updatedAt), desc(MemoryTable.createdAt)],
      });

      return {
        success: true,
        data: records.map(mapMemory),
      };
    } catch {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Memories could not be loaded right now.",
        },
      };
    }
  },

  listContentHashes: async ({
    db,
    userId,
    contentHashes,
  }: {
    db: Database;
    userId: string;
    contentHashes: string[];
  }): Promise<Result<Set<string>, MemoryError>> => {
    if (contentHashes.length === 0) {
      return {
        success: true,
        data: new Set(),
      };
    }

    try {
      const records = await db.query.Memory.findMany({
        where: and(
          eq(MemoryTable.userId, userId),
          inArray(MemoryTable.contentHash, contentHashes),
        ),
        columns: {
          contentHash: true,
        },
      });

      return {
        success: true,
        data: new Set(records.map((record) => record.contentHash)),
      };
    } catch {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Memory dedupe could not be checked right now.",
        },
      };
    }
  },

  create: async ({
    db,
    userId,
    content,
    contentHash,
    source,
    importId,
  }: {
    db: Database;
    userId: string;
    content: string;
    contentHash: string;
    source: MemorySource;
    importId?: string | null;
  }): Promise<Result<Memory, MemoryError>> => {
    try {
      const [record] = await db
        .insert(MemoryTable)
        .values({
          userId,
          content,
          contentHash,
          source,
          importId: importId ?? null,
        })
        .returning();

      if (!record) {
        return {
          success: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Memory could not be saved right now.",
          },
        };
      }

      return {
        success: true,
        data: mapMemory(record),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: "That memory already exists.",
          },
        };
      }

      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Memory could not be saved right now.",
        },
      };
    }
  },

  createMany: async ({
    db,
    userId,
    importId,
    source,
    entries,
  }: {
    db: Database;
    userId: string;
    importId: string;
    source: Extract<MemorySource, "file" | "chatgpt_import">;
    entries: Array<{ content: string; contentHash: string }>;
  }): Promise<Result<Memory[], MemoryError>> => {
    if (entries.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // Drop in-batch duplicates so a single insert cannot trip the unique index.
    const seenHashes = new Set<string>();
    const uniqueEntries = entries.filter((entry) => {
      if (seenHashes.has(entry.contentHash)) {
        return false;
      }
      seenHashes.add(entry.contentHash);
      return true;
    });

    if (uniqueEntries.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    try {
      const records = await db
        .insert(MemoryTable)
        .values(
          uniqueEntries.map((entry) => ({
            userId,
            importId,
            source,
            content: entry.content,
            contentHash: entry.contentHash,
          })),
        )
        .onConflictDoNothing({
          target: [MemoryTable.userId, MemoryTable.contentHash],
        })
        .returning();

      return {
        success: true,
        data: records.map(mapMemory),
      };
    } catch {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Imported memories could not be saved right now.",
        },
      };
    }
  },

  update: async ({
    db,
    userId,
    id,
    content,
    contentHash,
  }: {
    db: Database;
    userId: string;
    id: string;
    content: string;
    contentHash: string;
  }): Promise<Result<Memory, MemoryError>> => {
    try {
      const [record] = await db
        .update(MemoryTable)
        .set({
          content,
          contentHash,
          updatedAt: new Date(),
        })
        .where(and(eq(MemoryTable.id, id), eq(MemoryTable.userId, userId)))
        .returning();

      if (!record) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "That memory could not be found.",
          },
        };
      }

      return {
        success: true,
        data: mapMemory(record),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: "That memory already exists.",
          },
        };
      }

      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Memory could not be updated right now.",
        },
      };
    }
  },

  remove: async ({
    db,
    userId,
    id,
  }: {
    db: Database;
    userId: string;
    id: string;
  }): Promise<Result<{ ok: true }, MemoryError>> => {
    try {
      const records = await db
        .delete(MemoryTable)
        .where(and(eq(MemoryTable.id, id), eq(MemoryTable.userId, userId)))
        .returning({ id: MemoryTable.id });

      if (records.length === 0) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "That memory could not be found.",
          },
        };
      }

      return {
        success: true,
        data: { ok: true },
      };
    } catch {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Memory could not be deleted right now.",
        },
      };
    }
  },
};
