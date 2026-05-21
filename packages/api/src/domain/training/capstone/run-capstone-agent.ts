import { generateText, stepCountIs } from "ai";

import { CapstoneScenarioSchema } from "@acme/validators";

import type { CapstoneClusterHistory } from "../prompts/fragments";
import type { CapstoneScenario } from "./types/capstone.types";
import { getAiModelForPurpose } from "../engine/model-router";
import { composePrompt } from "../prompts/compose";
import { formatCapstoneHistory } from "../prompts/fragments";
import { capstoneAgentPrompt } from "../prompts/legacy-registry";
import { buildFallbackTeachCapstone } from "./fallback-capstone";
import { createBuildChallengeTool } from "./tools/build-challenge.tool";
import { createDebateScenarioTool } from "./tools/debate-scenario.tool";
import { createTeachChallengeTool } from "./tools/teach-challenge.tool";

export const runCapstoneAgent = async ({
  clusterTitle,
  clusterSummary,
  clusterWhyItMatters,
  simulationTitle,
  simulationSummary,
  history,
}: {
  clusterTitle: string;
  clusterSummary: string;
  clusterWhyItMatters: string;
  simulationTitle: string;
  simulationSummary: string;
  history: CapstoneClusterHistory[];
}): Promise<CapstoneScenario> => {
  const fallback = buildFallbackTeachCapstone({
    clusterTitle,
    clusterSummary,
    whyItMatters: clusterWhyItMatters,
  });
  const model = getAiModelForPurpose("capstone");

  if (!model) {
    return fallback;
  }

  const tools = {
    createBuildChallenge: createBuildChallengeTool(),
    createDebateScenario: createDebateScenarioTool(),
    createTeachChallenge: createTeachChallengeTool(),
  };

  const composed = composePrompt(capstoneAgentPrompt, {
    "Cluster title": clusterTitle,
    "Cluster summary": clusterSummary,
    "Why it matters": clusterWhyItMatters,
    "Simulation node title": simulationTitle,
    "Simulation node summary": simulationSummary,
    "Learner history across units in this cluster":
      formatCapstoneHistory(history),
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({
        model,
        stopWhen: stepCountIs(2),
        tools,
        system: composed.system,
        prompt:
          attempt === 0
            ? composed.prompt
            : `${composed.prompt}\n\nRetry instructions: call one tool with fully valid structured inputs. Do not answer in plain prose.`,
      });

      const toolResults = result.steps.flatMap((step) => step.toolResults);
      const selectedScenario = toolResults.at(-1)?.output;
      if (!selectedScenario) {
        continue;
      }

      return CapstoneScenarioSchema.parse(selectedScenario);
    } catch (error) {
      if (attempt === 1 && error instanceof Error) {
        console.error(error);
      }
    }
  }

  return fallback;
};
