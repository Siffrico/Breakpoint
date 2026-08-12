import type { SeedStageOutput, UnitBuilderContext } from "./contracts";
import { getSeedTaskReadinessIssue } from "../education-unit/unit-readiness";
import {
  ArtifactBuildError,
  runAgent,
} from "../orchestration/agent-runtime";
import { SeedStageOutputSchema, UnitBuilderContextSchema } from "./contracts";
import { buildSeedStageRequest } from "./seed-prompt-policy";

export const runSeedStage = async (
  context: UnitBuilderContext,
  options?: { abortSignal?: AbortSignal },
): Promise<SeedStageOutput> => {
  UnitBuilderContextSchema.parse(context);
  const request = buildSeedStageRequest(context);

  const output = await runAgent({
    agent: "buildContent",
    system: request.system,
    schema: SeedStageOutputSchema,
    errorMessage: "Failed to generate the seed stage.",
    prompt: request.prompt,
    abortSignal: options?.abortSignal,
  });
  const responseMode =
    context.planContext.clusterContext?.taskContract?.practiceContract
      .responseMode;
  if (!responseMode) {
    throw new ArtifactBuildError(
      "Unit task response mode is missing.",
      "schema",
    );
  }
  const readinessIssue = getSeedTaskReadinessIssue({
    seedPrompt: output.seedPrompt,
    responseMode,
  });
  if (readinessIssue) {
    throw new ArtifactBuildError(readinessIssue, "schema", output);
  }
  return output;
};
