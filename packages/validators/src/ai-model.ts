import { z } from "zod/v4";

export const AiModelPreferenceSchema = z.enum([
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
]);

export const AI_MODEL_OPTIONS = [
  {
    value: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    description: "Lower-latency, lighter model for faster turns.",
  },
  {
    value: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "Higher-capability model for curriculum and tutor work.",
  },
] as const satisfies readonly {
  value: AiModelPreference;
  label: string;
  description: string;
}[];

export type AiModelPreference = z.infer<typeof AiModelPreferenceSchema>;
