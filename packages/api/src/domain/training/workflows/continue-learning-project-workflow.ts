import type { Result } from "../../../lib/result";
import type { CurriculumPlan } from "../types/training.types";
import { err, ok } from "../../../lib/result";

interface ContinueLearningProjectDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  hasUnitContent: (nodeId: string) => Promise<boolean>;
}

/**
 * Takes an owned launch-ready project and returns its workspace destination.
 * Model-backed recovery belongs to the resumable project build, never this
 * learner click.
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
    .filter((node) => node.kind === "unit")
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const nextNode = learningNodes.find((node) => node.status === "ready");

  if (!nextNode) {
    const isComplete =
      learningNodes.length > 0 &&
      learningNodes.every((node) => node.status === "completed");
    return err(
      isComplete
        ? "This learning project is complete."
        : "This project is still preparing its first unit.",
    );
  }
  if (!(await deps.hasUnitContent(nextNode.id))) {
    return err("This project is still preparing its first unit.");
  }

  return ok({
    sessionId,
    nodeId: nextNode.id,
    href: `/workspace?session=${encodeURIComponent(sessionId)}`,
  });
};
