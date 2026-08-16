import { tool } from "ai";
import { z } from "zod/v4";

import { StartingPointTierSchema } from "@acme/validators";

export const AskStartingPointInputSchema = z.object({
  question: z.string().min(1),
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        tier: StartingPointTierSchema,
      }),
    )
    .min(3)
    .max(4),
});

export const AskStartingPointOutputSchema = z.object({
  tier: StartingPointTierSchema,
  label: z.string().min(1),
});

export type AskStartingPointInput = z.infer<typeof AskStartingPointInputSchema>;

export const askStartingPointTool = tool({
  description:
    "Ask where the learner is starting from using concrete domain-specific experiences, once, before proposing outcomes.",
  inputSchema: AskStartingPointInputSchema,
  outputSchema: AskStartingPointOutputSchema,
});

export type CreateProjectResult =
  | {
      ok: true;
      sessionId: string;
      planId: string;
      title: string;
      moduleCount: number;
      firstUnitId: string | null;
      resuming?: boolean;
    }
  | { ok: false; reason: string };

export const normalizeLearningTrackName = (input: string): string => {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "learning-track";
};
