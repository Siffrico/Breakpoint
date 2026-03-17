import type { LearningDomainCard } from "../types/esde-simulation.types";
import type { Result } from "../../../lib/result";

interface GetDomainCatalogDependencies {
  listDomains: () => Promise<Result<LearningDomainCard[]>>;
}

export const getDomainCatalogWorkflow = async (
  deps: GetDomainCatalogDependencies,
) => {
  return deps.listDomains();
};
