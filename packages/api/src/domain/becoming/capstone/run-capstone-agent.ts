import { generateText, stepCountIs } from "ai";

import { CapstoneScenarioSchema } from "@acme/validators";

import { getBecomingModel } from "../services/becoming-model";

import { buildFallbackTeachCapstone } from "./fallback-capstone";
import { createBuildChallengeTool } from "./tools/build-challenge.tool";
import { createDebateScenarioTool } from "./tools/debate-scenario.tool";
import { createTeachChallengeTool } from "./tools/teach-challenge.tool";
import type { CapstoneScenario } from "./types/capstone.types";

interface CapstoneClusterHistory {
  title: string;
  summary: string;
  score: number;
  readiness: string;
  growthDimensions: string[] | null;
  improvements: string[];
  failureTags: string[];
}

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
  const model = getBecomingModel();

  if (!model) {
    return fallback;
  }

  const tools = {
    createBuildChallenge: createBuildChallengeTool(),
    createDebateScenario: createDebateScenarioTool(),
    createTeachChallenge: createTeachChallengeTool(),
  };

  const historySummary =
    history.length > 0
      ? history
          .map(
            (item, index) =>
              `${index + 1}. ${item.title}
- Summary: ${item.summary}
- Score: ${item.score}
- Readiness: ${item.readiness}
- Growth dimensions: ${item.growthDimensions?.join(", ") || "None captured"}
- Improvements: ${item.improvements.join("; ") || "None captured"}
- Failure tags: ${item.failureTags.join("; ") || "None captured"}`,
          )
          .join("\n")
      : "No unit history available.";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({
        model,
        stopWhen: stepCountIs(2),
        tools,
        system: `You design cluster capstones for Breakpoint. Choose exactly one tool.

Pick the format that best pressure-tests integrated application of the cluster:
- Build when the learner should produce a concrete artifact that proves synthesis.
- Debate when the cluster is mostly about judgment, tradeoffs, or contested decisions.
- Teach when the cluster is conceptual or technical and distillation under audience constraints is the best test.

Do not hedge across tools. Use one tool once. Make the challenge concrete, high-stakes, and tightly tied to the cluster.`,
        prompt: `Create a capstone for this completed cluster.

Cluster title: ${clusterTitle}
Cluster summary: ${clusterSummary}
Why it matters: ${clusterWhyItMatters}
Simulation node title: ${simulationTitle}
Simulation node summary: ${simulationSummary}

Learner history across units in this cluster:
${historySummary}

Quality bar:
- The challenge must require integrating multiple cluster skills together.
- Avoid generic productivity advice, generic ethics debates, or fluffy explainers.
- Match the difficulty to the learner's history. If they had repeated failure tags, pressure-test those weak points.
- If build: require a specific artifact and concrete constraints.
- If debate: make the opposing stance sharp and credible.
- If teach: choose a constrained audience that forces simplification without distortion.

${attempt === 0 ? "" : "Retry instructions: call one tool with fully valid structured inputs. Do not answer in plain prose."}`,
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
