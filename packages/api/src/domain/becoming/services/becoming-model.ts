import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const DEFAULT_MODEL = "gpt-4.1-mini";

export const getBecomingModel = (modelName?: string): LanguageModel | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const openai = createOpenAI({ apiKey });
  return openai(modelName ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL);
};
