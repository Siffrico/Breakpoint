import type { Memory, MemoryError } from "../types";
import type { Result } from "../../../lib/result";
import { err } from "../../../lib/result";
import { getMemoryContentHash, normalizeMemoryContent } from "../policies/memory-caps";

interface CreateManualMemoryDependencies {
  createMemory: (payload: {
    content: string;
    contentHash: string;
  }) => Promise<Result<Memory, MemoryError>>;
}

export const createManualMemoryWorkflow = async ({
  content,
  deps,
}: {
  content: string;
  deps: CreateManualMemoryDependencies;
}): Promise<Result<Memory, MemoryError>> => {
  const normalizedContent = normalizeMemoryContent(content);

  if (!normalizedContent) {
    return err({
      code: "BAD_REQUEST",
      message: "Write a memory before saving it.",
    });
  }

  return deps.createMemory({
    content: normalizedContent,
    contentHash: getMemoryContentHash(normalizedContent),
  });
};
