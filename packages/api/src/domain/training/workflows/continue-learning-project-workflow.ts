import type { Result } from "../../../lib/result";
import type { CurriculumPlan } from "../types/training.types";
import { err, ok } from "../../../lib/result";

interface ContinueLearningProjectDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  recoverSkillUnits: () => Promise<void>;
  startUnitPreparation: (input: { nodeId: string; sessionId: string }) => void;
}

/**
 * Takes an owned learning-project session id, starts preparation of the earliest
 * incomplete education unit, and immediately returns its workspace destination.
 */
export const continueLearningProjectWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: ContinueLearningProjectDependencies;
}): Promise<Result<{ sessionId: string; nodeId: string; href: string }>> => {
  let plan = await deps.getActivePlan(sessionId);
  if (!plan) {
    return err("This project's curriculum is not ready yet.");
  }

  let learningNodes = plan.nodes
    .filter((node) => node.kind === "unit")
    .sort((left, right) => left.orderIndex - right.orderIndex);
  let nextNode = learningNodes.find((node) => node.status === "ready");

  if (!nextNode) {
    await deps.recoverSkillUnits();
    plan = await deps.getActivePlan(sessionId);
    if (!plan) return err("This project's curriculum is not ready yet.");
    learningNodes = plan.nodes
      .filter((node) => node.kind === "unit")
      .sort((left, right) => left.orderIndex - right.orderIndex);
    nextNode = learningNodes.find((node) => node.status === "ready");
  }

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

  deps.startUnitPreparation({ nodeId: nextNode.id, sessionId });

  return ok({
    sessionId,
    nodeId: nextNode.id,
    href: `/workspace?session=${encodeURIComponent(sessionId)}`,
  });
};
