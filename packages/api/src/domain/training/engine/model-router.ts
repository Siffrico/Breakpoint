import type { LanguageModel, ToolSet } from "ai";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import type { AiModelPreference } from "@acme/validators";
import { AiModelPreferenceSchema } from "@acme/validators";

import type { ModelTier } from "../prompts/types";

type AiProvider = "google" | "openai" | "openrouter";
type CodeDefaultAiStack = "openai-gpt-5.5" | "openrouter-glm-5.2";

const CODE_DEFAULT_AI_STACK: CodeDefaultAiStack = "openrouter-glm-5.2";

const CODE_DEFAULT_PROVIDER: Record<CodeDefaultAiStack, AiProvider> = {
  "openai-gpt-5.5": "openai",
  "openrouter-glm-5.2": "openrouter",
};

const CODE_DEFAULT_TIER_MODELS: Record<
  CodeDefaultAiStack,
  Record<ModelTier, string>
> = {
  "openai-gpt-5.5": {
    critical: "gpt-5.5",
    standard: "gpt-5.5-mini",
  },
  "openrouter-glm-5.2": {
    critical: "z-ai/glm-5.2",
    standard: "z-ai/glm-5.2",
  },
};

export type AiModelPurpose =
  | "onboarding"
  | "curriculum"
  | "buildContent"
  | "failure"
  | "ghost"
  | "education"
  | "recall"
  | "evaluation"
  | "tutor"
  | "capstone"
  | "projectOverview"
  | "default";

const PURPOSE_TIER: Record<AiModelPurpose, ModelTier> = {
  onboarding: "critical",
  curriculum: "critical",
  buildContent: "critical",
  failure: "critical",
  ghost: "critical",
  education: "critical",
  recall: "standard",
  evaluation: "critical",
  tutor: "standard",
  capstone: "critical",
  projectOverview: "critical",
  default: "standard",
};

const getEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  return value;
};

const isEnabled = (name: string): boolean => {
  const value = getEnv(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
};

const getSelectedProvider = (): AiProvider =>
  CODE_DEFAULT_PROVIDER[CODE_DEFAULT_AI_STACK];

const PROVIDER_API_KEY_ENV: Record<AiProvider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const getProviderApiKey = (provider: AiProvider): string | undefined =>
  getEnv(PROVIDER_API_KEY_ENV[provider]);

const getProviderMissingKeyMessage = (
  provider: AiProvider,
  context: string,
): string => `${PROVIDER_API_KEY_ENV[provider]} is required for ${context}.`;

const resolveModelName = ({
  tier,
}: {
  tier: ModelTier;
  modelName?: string;
}): string => {
  return CODE_DEFAULT_TIER_MODELS[CODE_DEFAULT_AI_STACK][tier];
};

const createModel = ({
  provider,
  apiKey,
  modelName,
}: {
  provider: AiProvider;
  apiKey: string;
  modelName: string;
}): LanguageModel => {
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey })(modelName);
  }

  if (provider === "openrouter") {
    return createOpenRouter({ apiKey })(modelName);
  }

  return createOpenAI({ apiKey })(modelName);
};

export const getAiProvider = (): AiProvider => getSelectedProvider();

export const parseAiModelPreference = (
  modelName?: string | null,
): AiModelPreference | null => {
  const parsed = AiModelPreferenceSchema.safeParse(modelName);
  return parsed.success ? parsed.data : null;
};

export const withAiModelPreference = async <T>(
  _modelName: string | null | undefined,
  callback: () => Promise<T>,
): Promise<T> => {
  return callback();
};

export const getSearchToolsForSelectedProvider = (
  _purpose?: AiModelPurpose,
): ToolSet => {
  if (!isEnabled("AI_ENABLE_SEARCH_TOOLS")) {
    return {};
  }

  const provider = getSelectedProvider();

  if (provider === "openai") {
    return {
      web_search: openai.tools.webSearch({
        searchContextSize: "high",
      }),
    } as unknown as ToolSet;
  }

  // OpenRouter does grounding via the `:online` model suffix / web plugin
  // rather than an AI SDK tool, so there is no provider-native tool to attach.
  if (provider === "openrouter") {
    return {};
  }

  return {
    google_search: google.tools.googleSearch({}),
  } as unknown as ToolSet;
};

export const getAiModelForTier = (tier: ModelTier): LanguageModel | null => {
  const provider = getSelectedProvider();
  const apiKey = getProviderApiKey(provider);
  if (!apiKey) return null;

  return createModel({
    provider,
    apiKey,
    modelName: resolveModelName({ tier }),
  });
};

export const getAiModelForPurpose = (
  purpose: AiModelPurpose,
  modelName?: string,
): LanguageModel | null => {
  const provider = getSelectedProvider();
  const apiKey = getProviderApiKey(provider);
  if (!apiKey) return null;

  const tier = PURPOSE_TIER[purpose];
  return createModel({
    provider,
    apiKey,
    modelName: resolveModelName({ tier, modelName }),
  });
};

export const requireAiModelForPurpose = (
  purpose: AiModelPurpose,
  context: string,
  modelName?: string,
): LanguageModel => {
  const provider = getSelectedProvider();
  const model = getAiModelForPurpose(purpose, modelName);
  if (!model) {
    throw new Error(getProviderMissingKeyMessage(provider, context));
  }

  return model;
};

export const getMissingAiKeyMessage = (context: string): string =>
  getProviderMissingKeyMessage(getSelectedProvider(), context);

export const getModelForTier = getAiModelForTier;

export const getModelByName = (modelName?: string): LanguageModel | null =>
  getAiModelForPurpose("default", modelName);
