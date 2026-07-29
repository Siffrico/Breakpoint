import type { UnitContent } from "../types/training.types";

export type UnitReadiness =
  | { kind: "ready" }
  | { kind: "preparing" }
  | { kind: "failed"; retryable: true; message: string };

interface GetUnitReadinessDependencies {
  awaitBuildSettled: (nodeId: string) => Promise<boolean>;
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  waitForStartGrace: () => Promise<void>;
}

const learnerSafeFailureMessage =
  "Your learning unit could not be prepared. Please try again.";

export const getUnitReadinessWorkflow = async ({
  nodeId,
  deps,
}: {
  nodeId: string;
  deps: GetUnitReadinessDependencies;
}): Promise<UnitReadiness> => {
  const readAfterBuildWait = async () => {
    const settled = await deps.awaitBuildSettled(nodeId);
    const unit = await deps.getUnitByNodeId(nodeId);
    return { settled, unit };
  };

  const first = await readAfterBuildWait();
  if (first.unit) return { kind: "ready" };
  if (!first.settled) return { kind: "preparing" };

  // The background callback may be scheduled but not yet have acquired its
  // advisory lock. One bounded grace recheck avoids reporting that handoff as
  // a permanent generation failure.
  await deps.waitForStartGrace();
  const second = await readAfterBuildWait();
  if (second.unit) return { kind: "ready" };
  if (!second.settled) return { kind: "preparing" };

  return {
    kind: "failed",
    retryable: true,
    message: learnerSafeFailureMessage,
  };
};
