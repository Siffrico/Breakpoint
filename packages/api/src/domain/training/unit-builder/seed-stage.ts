import type { SeedStageOutput, UnitBuilderContext } from "./contracts";
import { getSeedTaskReadinessIssue } from "../education-unit/unit-readiness";
import {
  ArtifactBuildError,
  runResilientAgent,
} from "../orchestration/agent-runtime";
import {
  renderSeedPrompt,
  seedStageOutputSchema,
  UnitBuilderContextSchema,
} from "./contracts";
import { buildSeedStageRequest } from "./seed-prompt-policy";

export const runSeedStage = async (
  context: UnitBuilderContext,
  options?: { abortSignal?: AbortSignal },
): Promise<SeedStageOutput> => {
  UnitBuilderContextSchema.parse(context);
  const request = buildSeedStageRequest(context);
  const responseMode =
    context.planContext.clusterContext?.taskContract?.practiceContract
      .responseMode;
  if (!responseMode) {
    throw new ArtifactBuildError(
      "Unit task response mode is missing.",
      "schema",
    );
  }
  const selectedResponse = responseMode === "select";

  const output = await runResilientAgent({
    agent: "buildContent",
    system: request.system,
    schema: seedStageOutputSchema(selectedResponse),
    errorMessage: "Failed to generate the seed stage.",
    prompt: request.prompt,
    abortSignal: options?.abortSignal,
  });
  const seedPrompt = renderSeedPrompt(output);
  const readinessIssue = getSeedTaskReadinessIssue({
    seedPrompt,
    responseMode,
  });
  if (readinessIssue) {
    throw new ArtifactBuildError(readinessIssue, "schema", output);
  }
  return { ...output, seedPrompt };
};
