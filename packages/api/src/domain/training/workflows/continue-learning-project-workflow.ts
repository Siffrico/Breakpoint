import type { Result } from "../../../lib/result";
import type { CurriculumPlan } from "../types/training.types";
import { err, ok } from "../../../lib/result";

interface ContinueLearningProjectDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  prepareUnit: (input: {
    nodeId: string;
    sessionId: string;
  }) => Promise<Result<unknown>>;
}

/**
 * Takes an owned learning-project session id, produces the prepared earliest
 * incomplete education-unit destination, and fails only when the curriculum is
 * unavailable, complete, or the unit scenario cannot be prepared.
 */
export const continueLearningProjectWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: ContinueLearningProjectDependencies;
}): Promise<Result<{ sessionId: string; nodeId: string; href: string }>> => {
  const plan = await deps.getActivePlan(sessionId);
  if (!plan) {
    return err("This project's curriculum is not ready yet.");
  }

  const learningNodes = plan.nodes
    .filter((node) => node.kind === "unit" || node.kind === "integration")
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const nextNode = learningNodes.find((node) => node.status === "ready");

  if (!nextNode) {
    const isComplete =
      learningNodes.length > 0 &&
      learningNodes.every((node) => node.status === "completed");
    return err(
      isComplete
        ? "This learning project is complete."
        : "The next education unit is not ready yet.",
    );
  }

  const preparedUnit = await deps.prepareUnit({
    nodeId: nextNode.id,
    sessionId,
  });
  if (!preparedUnit.success) {
    return err(preparedUnit.error);
  }

  return ok({
    sessionId,
    nodeId: nextNode.id,
    href: `/workspace?session=${encodeURIComponent(sessionId)}`,
  });
};
