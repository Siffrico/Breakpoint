import type { Result } from "../../../lib/result";
import type { CurriculumPlan } from "../types/training.types";
import { err, ok } from "../../../lib/result";

interface GetActivePlanDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
}

export const getActivePlanWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GetActivePlanDependencies;
}): Promise<Result<CurriculumPlan>> => {
  const plan = await deps.getActivePlan(sessionId);
  return plan ? ok(plan) : err("Curriculum plan does not exist yet.");
};
