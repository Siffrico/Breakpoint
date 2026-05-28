import { tool } from "ai";
import type { z } from "zod/v4";

import { DebateCapstoneScenarioSchema } from "@acme/validators";

const DebateScenarioInputSchema = DebateCapstoneScenarioSchema.omit({
  format: true,
});

export const createDebateScenarioTool = () =>
  tool({
    description:
      "Create a debate-style capstone when the learner should defend judgment under pressure against a strong opposing argument.",
    inputSchema: DebateScenarioInputSchema,
    execute: (input: DebateScenarioInput) =>
      DebateCapstoneScenarioSchema.parse({
        format: "debate",
        ...input,
      }),
  });

export type DebateScenarioInput = z.infer<typeof DebateScenarioInputSchema>;
