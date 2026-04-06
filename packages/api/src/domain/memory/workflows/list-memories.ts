import type { Memory, MemoryError } from "../types";
import type { Result } from "../../../lib/result";

interface ListMemoriesDependencies {
  listMemories: () => Promise<Result<Memory[], MemoryError>>;
}

export const listMemoriesWorkflow = async ({
  deps,
}: {
  deps: ListMemoriesDependencies;
}): Promise<Result<Memory[], MemoryError>> => deps.listMemories();
