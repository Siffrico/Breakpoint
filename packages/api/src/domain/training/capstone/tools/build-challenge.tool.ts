import { tool } from "ai";
import type { z } from "zod/v4";

import { BuildCapstoneScenarioSchema } from "@acme/validators";

const BuildChallengeInputSchema = BuildCapstoneScenarioSchema.omit({
  format: true,
});

export const createBuildChallengeTool = () =>
  tool({
    description:
      "Create a build-style capstone when the learner should produce a concrete artifact that integrates the cluster's skills.",
    inputSchema: BuildChallengeInputSchema,
    execute: (input: BuildChallengeInput) =>
      BuildCapstoneScenarioSchema.parse({
        format: "build",
        ...input,
      }),
  });

export type BuildChallengeInput = z.infer<typeof BuildChallengeInputSchema>;
