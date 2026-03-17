import { err, type Result } from "../../../lib/result";
import type {
  ActiveScenario,
  LearningDomainCard,
} from "../types/esde-simulation.types";

interface GetActiveScenarioInput {
  domainSlug: string;
}

interface GetActiveScenarioDependencies {
  getDomainBySlug: (domainSlug: string) => Promise<Result<LearningDomainCard>>;
  getActiveScenarioByDomainSlug: (
    domainSlug: string,
  ) => Promise<Result<ActiveScenario>>;
}

export const getActiveScenarioWorkflow = async (
  input: GetActiveScenarioInput,
  deps: GetActiveScenarioDependencies,
) => {
  const domainResult = await deps.getDomainBySlug(input.domainSlug);
  if (!domainResult.success) {
    return domainResult;
  }

  if (domainResult.data.status !== "available") {
    return err("This domain is locked right now.");
  }

  return deps.getActiveScenarioByDomainSlug(input.domainSlug);
};
