import { z } from "zod/v4";

import { ProjectOverviewSchema } from "@acme/validators";

export const LearnerUnderstandingSchema = z.object({
  build: z.string().min(1),
  goodMeans: z.array(z.string().min(1)).min(1).max(5),
  currentGap: z.string().min(1),
});

export const ProjectOverviewOutputSchema = ProjectOverviewSchema.omit({
  generatedAt: true,
});

export type LearnerUnderstanding = z.infer<typeof LearnerUnderstandingSchema>;
export type ProjectOverviewOutput = z.infer<typeof ProjectOverviewOutputSchema>;
