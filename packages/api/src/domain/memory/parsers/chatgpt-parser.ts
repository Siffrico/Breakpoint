import { memoryCaps, normalizeImportPayload, normalizeMemoryContent } from "../policies/memory-caps";

const bulletPattern = /^(?:[-*•]+|\d+[.)]|[a-z][.)])\s+/i;

const finalizeEntry = (value: string) => {
  const cleaned = normalizeMemoryContent(
    value.replace(bulletPattern, "").replace(/^["'`]+|["'`]+$/g, ""),
  );

  return cleaned.slice(0, memoryCaps.maxContentChars);
};

export const parseChatGptMemories = (input: string) => {
  const lines = normalizeImportPayload(input).split("\n");
  const entries: string[] = [];
  let current = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (current) {
        entries.push(finalizeEntry(current));
        current = "";
      }
      continue;
    }

    if (bulletPattern.test(line)) {
      if (current) {
        entries.push(finalizeEntry(current));
      }
      current = line;
      continue;
    }

    current = current ? `${current} ${line}` : line;
  }

  if (current) {
    entries.push(finalizeEntry(current));
  }

  return entries
    .filter((entry) => entry.length > 0)
    .slice(0, memoryCaps.maxImportEntries);
};
