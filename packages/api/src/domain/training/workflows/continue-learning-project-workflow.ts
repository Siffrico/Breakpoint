import type { Result } from "../../../lib/result";
import type { CurriculumPlan } from "../types/training.types";
import { err, ok } from "../../../lib/result";

interface ContinueLearningProjectDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
}

/**
 * Takes an owned active project and returns its workspace destination. The
 * workspace projection owns preparation, active-unit, and completion state.
 */
export const continueLearningProjectWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: ContinueLearningProjectDependencies;
}): Promise<Result<{ sessionId: string; href: string }>> => {
  const plan = await deps.getActivePlan(sessionId);
  if (!plan) {
    return err("This project's curriculum is not ready yet.");
  }

  return ok({
    sessionId,
    href: `/workspace?session=${encodeURIComponent(sessionId)}`,
  });
};
