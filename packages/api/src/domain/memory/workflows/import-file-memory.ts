import type { Result } from "../../../lib/result";
import type { MemoryError, MemoryImportResult } from "../types";
import { err } from "../../../lib/result";
import { parseFileMemories } from "../parsers/file-parser";
import {
  getMemoryContentHash,
  getUtf8ByteLength,
  memoryCaps,
  normalizeImportPayload,
} from "../policies/memory-caps";

interface ImportFileMemoryDependencies {
  getExistingHashes: (
    contentHashes: string[],
  ) => Promise<Result<Set<string>, MemoryError>>;
  createImport: (payload: {
    rawPayload: string;
    entryCount: number;
  }) => Promise<Result<MemoryImportResult["import"], MemoryError>>;
  createMemories: (payload: {
    importId: string;
    entries: { content: string; contentHash: string }[];
  }) => Promise<Result<MemoryImportResult["entries"], MemoryError>>;
}

export const importFileMemoryWorkflow = async ({
  text,
  deps,
}: {
  text: string;
  deps: ImportFileMemoryDependencies;
}): Promise<Result<MemoryImportResult, MemoryError>> => {
  const rawPayload = normalizeImportPayload(text);

  if (!rawPayload) {
    return err({
      code: "BAD_REQUEST",
      message: "Upload a file with at least one memory.",
    });
  }

  if (getUtf8ByteLength(rawPayload) > memoryCaps.maxImportBytes) {
    return err({
      code: "PAYLOAD_TOO_LARGE",
      message: "That file is too large. Keep it under 200 KB.",
    });
  }

  const parsedEntries = parseFileMemories(rawPayload);
  if (parsedEntries.length === 0) {
    return err({
      code: "BAD_REQUEST",
      message: "No memories could be parsed from that file.",
    });
  }

  const uniqueEntries = Array.from(new Set(parsedEntries)).map((content) => ({
    content,
    contentHash: getMemoryContentHash(content),
  }));
  const existingHashesResult = await deps.getExistingHashes(
    uniqueEntries.map((entry) => entry.contentHash),
  );

  if (!existingHashesResult.success) {
    return existingHashesResult;
  }

  const freshEntries = uniqueEntries.filter(
    (entry) => !existingHashesResult.data.has(entry.contentHash),
  );
  const importResult = await deps.createImport({
    rawPayload,
    entryCount: freshEntries.length,
  });

  if (!importResult.success) {
    return importResult;
  }

  const entriesResult = await deps.createMemories({
    importId: importResult.data.id,
    entries: freshEntries,
  });

  if (!entriesResult.success) {
    return entriesResult;
  }

  return {
    success: true,
    data: {
      import: importResult.data,
      entries: entriesResult.data,
    },
  };
};
