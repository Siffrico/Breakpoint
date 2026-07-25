import {
  memoryCaps,
  normalizeImportPayload,
  normalizeMemoryContent,
} from "../policies/memory-caps";

export const parseFileMemories = (input: string) =>
  normalizeImportPayload(input)
    .split(/\n+/)
    .map((line) =>
      normalizeMemoryContent(
        line
          .replace(/^(?:[-*•]+|\d+[.)])\s+/i, "")
          .replace(/^["'`]+|["'`]+$/g, ""),
      ).slice(0, memoryCaps.maxContentChars),
    )
    .filter((entry) => entry.length > 0)
    .slice(0, memoryCaps.maxImportEntries);
