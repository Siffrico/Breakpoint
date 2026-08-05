import type { SeedStageOutput, UnitBuilderContext } from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";
import { SeedStageOutputSchema, UnitBuilderContextSchema } from "./contracts";
import { buildSeedStageRequest } from "./seed-prompt-policy";

export const runSeedStage = async (
  context: UnitBuilderContext,
): Promise<SeedStageOutput> => {
  UnitBuilderContextSchema.parse(context);
  const request = buildSeedStageRequest(context);

  return runAgent({
    agent: "buildContent",
    system: request.system,
    schema: SeedStageOutputSchema,
    errorMessage: "Failed to generate the seed stage.",
    prompt: request.prompt,
  });
};
