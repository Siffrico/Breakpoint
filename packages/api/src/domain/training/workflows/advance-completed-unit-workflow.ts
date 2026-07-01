import type { Result } from "../../../lib/result";
import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../types/training.types";
import type { PersistedUnitRun } from "../education-unit/unit";
import { err, ok } from "../../../lib/result";
import { assertUnitCanAdvance } from "../workspace-ai/workspace-turn";

interface AdvanceCompletedUnitDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Promise<PersistedUnitRun | null>;
  completeNode: (nodeId: string) => Promise<CurriculumNode | null>;
  touchSession: (sessionId: string) => Promise<unknown>;
}

export const advanceCompletedUnitWorkflow = async ({
  sessionId,
  nodeId,
  deps,
}: {
  sessionId: string;
  nodeId: string;
  deps: AdvanceCompletedUnitDependencies;
}): Promise<Result<{ advanced: true }>> => {
  const plan = await deps.getActivePlan(sessionId);
  const node = plan?.nodes.find((item) => item.id === nodeId) ?? null;
  const unit = node ? await deps.getUnitByNodeId(node.id) : null;
  const run = unit ? await deps.getUnitRun(sessionId, unit.id) : null;

  try {
    assertUnitCanAdvance({ node, run });
  } catch (error) {
    return err(error instanceof Error ? error.message : "Unit cannot advance.");
  }

  if (node?.status !== "completed") {
    await deps.completeNode(nodeId);
  }
  await deps.touchSession(sessionId);

  return ok({ advanced: true });
};
