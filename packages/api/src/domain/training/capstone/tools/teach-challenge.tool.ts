import { tool } from "ai";
import { z } from "zod/v4";

import { TeachCapstoneScenarioSchema } from "@acme/validators";

const TeachChallengeInputSchema = TeachCapstoneScenarioSchema.omit({
  format: true,
});

export const createTeachChallengeTool = () =>
  tool({
    description:
      "Create a teach-style capstone when the learner should explain the cluster's core insight to a constrained audience and handle pushback.",
    inputSchema: TeachChallengeInputSchema,
    execute: async (input: TeachChallengeInput) =>
      TeachCapstoneScenarioSchema.parse({
        format: "teach",
        ...input,
      }),
  });

export type TeachChallengeInput = z.infer<typeof TeachChallengeInputSchema>;
