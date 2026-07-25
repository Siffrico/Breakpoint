import type { Result } from "../../../lib/result";
import type { Memory, MemoryError } from "../types";

interface ListMemoriesDependencies {
  listMemories: () => Promise<Result<Memory[], MemoryError>>;
}

export const listMemoriesWorkflow = async ({
  deps,
}: {
  deps: ListMemoriesDependencies;
}): Promise<Result<Memory[], MemoryError>> => deps.listMemories();
