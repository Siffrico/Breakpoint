import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import type { ModelTier } from "../prompts/types";

const TIER_DEFAULTS: Record<ModelTier, string> = {
  critical: "gpt-4.1",
  standard: "gpt-4.1-mini",
};

/**
 * Returns the appropriate model for a given tier.
 *
 * - critical: grading, failure isolation, curriculum design — needs highest accuracy
 * - standard: content generation, practice prompts, transcript turns — needs speed
 *
 * Respects env overrides: OPENAI_MODEL_CRITICAL and OPENAI_MODEL_STANDARD.
 * Falls back to OPENAI_MODEL for backwards compatibility.
 */
export const getModelForTier = (tier: ModelTier): LanguageModel | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const envOverride =
    tier === "critical"
      ? process.env.OPENAI_MODEL_CRITICAL
      : process.env.OPENAI_MODEL_STANDARD;

  const modelName = envOverride ?? process.env.OPENAI_MODEL ?? TIER_DEFAULTS[tier];

  const openai = createOpenAI({ apiKey });
  return openai(modelName);
};

/**
 * Returns a model by explicit name. Used by callers that need
 * a specific model (e.g. capstone agent with tool use).
 */
export const getModelByName = (modelName?: string): LanguageModel | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const name = modelName ?? process.env.OPENAI_MODEL ?? TIER_DEFAULTS.standard;
  const openai = createOpenAI({ apiKey });
  return openai(name);
};
