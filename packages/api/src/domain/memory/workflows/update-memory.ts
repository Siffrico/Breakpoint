import type { Memory, MemoryError } from "../types";
import type { Result } from "../../../lib/result";
import { err } from "../../../lib/result";
import { getMemoryContentHash, normalizeMemoryContent } from "../policies/memory-caps";

interface UpdateMemoryDependencies {
  updateMemory: (payload: {
    content: string;
    contentHash: string;
  }) => Promise<Result<Memory, MemoryError>>;
}

export const updateMemoryWorkflow = async ({
  content,
  deps,
}: {
  content: string;
  deps: UpdateMemoryDependencies;
}): Promise<Result<Memory, MemoryError>> => {
  const normalizedContent = normalizeMemoryContent(content);

  if (!normalizedContent) {
    return err({
      code: "BAD_REQUEST",
      message: "Write a memory before saving it.",
    });
  }

  return deps.updateMemory({
    content: normalizedContent,
    contentHash: getMemoryContentHash(normalizedContent),
  });
};
