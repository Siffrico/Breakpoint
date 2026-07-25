import type { Result } from "../../../lib/result";
import type { MemoryError } from "../types";

interface DeleteMemoryDependencies {
  removeMemory: () => Promise<Result<{ ok: true }, MemoryError>>;
}

export const deleteMemoryWorkflow = async ({
  deps,
}: {
  deps: DeleteMemoryDependencies;
}): Promise<Result<{ ok: true }, MemoryError>> => deps.removeMemory();
