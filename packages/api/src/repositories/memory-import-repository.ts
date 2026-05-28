import { MemoryImport as MemoryImportTable } from "@acme/db/schema";
import type { db as databaseClient } from "@acme/db/client";

import type { MemoryError, MemoryImport, MemoryImportSource } from "../domain/memory/types";
import type {Result} from "../lib/result";

type Database = typeof databaseClient;

const mapMemoryImport = (
  record: typeof MemoryImportTable.$inferSelect,
): MemoryImport => ({
  id: record.id,
  source: record.source as MemoryImportSource,
  entryCount: record.entryCount,
  createdAt: record.createdAt,
});

export const memoryImportRepository = {
  create: async ({
    db,
    userId,
    source,
    rawPayload,
    entryCount,
  }: {
    db: Database;
    userId: string;
    source: MemoryImportSource;
    rawPayload: string;
    entryCount: number;
  }): Promise<Result<MemoryImport, MemoryError>> => {
    try {
      const [record] = await db
        .insert(MemoryImportTable)
        .values({
          userId,
          source,
          rawPayload,
          entryCount,
        })
        .returning();

      if (!record) {
        return {
          success: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "The memory import audit record could not be saved.",
          },
        };
      }

      return {
        success: true,
        data: mapMemoryImport(record),
      };
    } catch {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "The memory import audit record could not be saved.",
        },
      };
    }
  },
};
