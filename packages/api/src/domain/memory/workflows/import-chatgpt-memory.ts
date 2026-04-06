import type { MemoryError, MemoryImportResult } from "../types";
import type { Result } from "../../../lib/result";
import { err } from "../../../lib/result";
import { parseChatGptMemories } from "../parsers/chatgpt-parser";
import {
  getMemoryContentHash,
  getUtf8ByteLength,
  memoryCaps,
  normalizeImportPayload,
} from "../policies/memory-caps";

interface ImportChatGptMemoryDependencies {
  getExistingHashes: (contentHashes: string[]) => Promise<Result<Set<string>, MemoryError>>;
  createImport: (payload: {
    rawPayload: string;
    entryCount: number;
  }) => Promise<Result<MemoryImportResult["import"], MemoryError>>;
  createMemories: (payload: {
    importId: string;
    entries: Array<{ content: string; contentHash: string }>;
  }) => Promise<Result<MemoryImportResult["entries"], MemoryError>>;
}

export const importChatGptMemoryWorkflow = async ({
  pasted,
  deps,
}: {
  pasted: string;
  deps: ImportChatGptMemoryDependencies;
}): Promise<Result<MemoryImportResult, MemoryError>> => {
  const rawPayload = normalizeImportPayload(pasted);

  if (!rawPayload) {
    return err({
      code: "BAD_REQUEST",
      message: "Paste the ChatGPT export before importing it.",
    });
  }

  if (getUtf8ByteLength(rawPayload) > memoryCaps.maxImportBytes) {
    return err({
      code: "PAYLOAD_TOO_LARGE",
      message: "That paste is too large. Keep it under 200 KB.",
    });
  }

  const parsedEntries = parseChatGptMemories(rawPayload);
  if (parsedEntries.length === 0) {
    return err({
      code: "BAD_REQUEST",
      message: "No memories could be parsed from that ChatGPT export.",
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
