import { z } from "zod/v4";

import { executePrompt } from "./engine";
import {
  recallCompressionPrompt,
  recallInterleavePrompt,
  recallSeedReturnPrompt,
} from "./prompts/legacy-registry";
import type { RecallProbeType } from "./types/becoming.types";

export interface RecallSourceUnit {
  nodeId: string;
  title: string;
  summary: string;
  clusterTitle: string | null;
  seedResponse: string | null;
  finalArticulation: string | null;
}

const RecallPromptSchema = z.object({
  prompt: z.string().min(1),
});

const formatUnits = (units: RecallSourceUnit[]) =>
  units
    .map((unit, index) =>
      [
        `Unit ${index + 1}: ${unit.title}`,
        unit.clusterTitle ? `Cluster: ${unit.clusterTitle}` : undefined,
        `Summary: ${unit.summary}`,
        unit.finalArticulation
          ? `Latest articulation: ${unit.finalArticulation}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

export const generateRecallProbe = async ({
  probeType,
  sourceUnits,
}: {
  probeType: RecallProbeType;
  sourceUnits: RecallSourceUnit[];
}) => {
  if (probeType === "seed_return") {
    const primaryUnit = sourceUnits[0];
    if (!primaryUnit) {
      throw new Error("A seed-return probe requires a source unit.");
    }

    if (!primaryUnit.seedResponse) {
      return {
        prompt: `Look back at your earlier answer for "${primaryUnit.title}". What was the specific flaw in your reasoning then, and what do you understand now that your earlier self missed?`,
        seedSnapshot: null,
      };
    }

    const object = await executePrompt({
      template: recallSeedReturnPrompt,
      schema: RecallPromptSchema,
      context: {
        Unit: `${primaryUnit.title}\nSummary: ${primaryUnit.summary}`,
        "Original seed response": primaryUnit.seedResponse,
        "Latest articulation":
          primaryUnit.finalArticulation ?? "Not available.",
      },
      errorMessage: "Failed to generate the recall probe.",
    });

    return {
      prompt: object.prompt,
      seedSnapshot: primaryUnit.seedResponse,
    };
  }

  if (probeType === "interleave") {
    const object = await executePrompt({
      template: recallInterleavePrompt,
      schema: RecallPromptSchema,
      context: {
        "Completed unit summaries": formatUnits(sourceUnits),
      },
      errorMessage: "Failed to generate the recall probe.",
    });

    return {
      prompt: object.prompt,
      seedSnapshot: null,
    };
  }

  const object = await executePrompt({
    template: recallCompressionPrompt,
    schema: RecallPromptSchema,
    context: {
      "Completed unit summaries": formatUnits(sourceUnits),
    },
    errorMessage: "Failed to generate the recall probe.",
  });

  return {
    prompt: object.prompt,
    seedSnapshot: null,
  };
};
