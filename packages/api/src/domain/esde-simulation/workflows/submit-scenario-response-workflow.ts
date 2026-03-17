import { err, ok, type Result } from "../../../lib/result";
import { gradeScenarioResponse } from "../policies/grade-scenario-response";
import type {
  ActiveScenario,
  LearningDomainCard,
  ScenarioEvaluation,
  SubmitScenarioResponseInput,
} from "../types/esde-simulation.types";

interface SubmitScenarioResponseDependencies {
  getDomainBySlug: (domainSlug: string) => Promise<Result<LearningDomainCard>>;
  getActiveScenarioByDomainSlug: (
    domainSlug: string,
  ) => Promise<Result<ActiveScenario>>;
}

export const submitScenarioResponseWorkflow = async (
  input: SubmitScenarioResponseInput,
  deps: SubmitScenarioResponseDependencies,
) => {
  const domainResult = await deps.getDomainBySlug(input.domainSlug);
  if (!domainResult.success) {
    return domainResult;
  }

  if (domainResult.data.status !== "available") {
    return err("This domain is locked right now.");
  }

  const scenarioResult = await deps.getActiveScenarioByDomainSlug(
    input.domainSlug,
  );
  if (!scenarioResult.success) {
    return scenarioResult;
  }

  if (scenarioResult.data.id !== input.scenarioId) {
    return err("The submitted scenario is not the active scenario.");
  }

  const trimmedResponse = input.response.trim();
  if (trimmedResponse.length < 40) {
    return err("Write a more complete answer before submitting.");
  }

  const evaluation: ScenarioEvaluation = gradeScenarioResponse({
    ...input,
    response: trimmedResponse,
  });

  return ok(evaluation);
};
