import { z } from "zod/v4";

export const AiModelPreferenceSchema = z.enum([
  "glm-5.2",
  "deepseek-v4-flash-0731",
  "deepseek-v4-pro-0813",
  "gpt-5.5",
  "gemini-3.5-flash",
]);

export type AiModelPreference = z.infer<typeof AiModelPreferenceSchema>;

/** The model every learner gets until they pick another on the Teachers page. */
export const DEFAULT_AI_MODEL: AiModelPreference = "glm-5.2";

export const AI_MODEL_OPTIONS = [
  {
    value: "glm-5.2",
    label: "GLM 5.2",
    description: "Default. Balanced reasoning for teaching and grading.",
  },
  {
    value: "deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash 0731",
    description: "Fast, capable reasoning for curriculum and evaluation work.",
  },
  {
    value: "deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro 0813",
    description:
      "Frontier reasoning for complex curriculum and evaluation work.",
  },
  {
    value: "gpt-5.5",
    label: "GPT 5.5",
    description: "OpenAI's frontier model for high-capability turns.",
  },
  {
    value: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "Low-latency Google model for fast turns.",
  },
] as const satisfies readonly {
  value: AiModelPreference;
  label: string;
  description: string;
}[];
