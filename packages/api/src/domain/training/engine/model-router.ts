import type { LanguageModel, ToolSet } from "ai";
import { AsyncLocalStorage } from "node:async_hooks";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import type { AiModelPreference } from "@acme/validators";
import { AiModelPreferenceSchema } from "@acme/validators";

import type { ModelTier } from "../prompts/types";

type AiProvider = "google" | "openai" | "openrouter";

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

const GOOGLE_TIER_DEFAULTS: Record<ModelTier, string> = {
  critical: "gemini-3.1-flash-lite",
  standard: "gemini-3.1-flash-lite",
};

const OPENAI_TIER_DEFAULTS: Record<ModelTier, string> = {
  critical: "gpt-4.1",
  standard: "gpt-4.1-mini",
};

const OPENROUTER_TIER_DEFAULTS: Record<ModelTier, string> = {
  critical: "z-ai/glm-5.2",
  standard: "z-ai/glm-5.2",
};

const OPENAI_PURPOSE_DEFAULTS: Partial<Record<AiModelPurpose, string>> = {
  onboarding: "gpt-5.4",
  curriculum: "gpt-5.4",
  evaluation: "gpt-5.4-mini",
};

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

const LEGACY_OPENAI_PURPOSE_ENV: Partial<Record<AiModelPurpose, string>> = {
  onboarding: "OPENAI_MODEL_ONBOARDING",
  curriculum: "OPENAI_MODEL_CURRICULUM",
  buildContent: "OPENAI_MODEL_BUILD_CONTENT",
  failure: "OPENAI_MODEL_FAILURE",
  ghost: "OPENAI_MODEL_GHOST",
  education: "OPENAI_MODEL_EDUCATION",
  recall: "OPENAI_MODEL_RECALL",
  evaluation: "OPENAI_MODEL_EVALUATION",
  tutor: "OPENAI_MODEL_TUTOR",
  projectOverview: "OPENAI_MODEL_PROJECT_OVERVIEW",
};

const PROVIDER_ENV = ["AI_PROVIDER", "AI_MODEL_PROVIDER"] as const;
const modelPreferenceStorage = new AsyncLocalStorage<AiModelPreference>();

const getEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  return value;
};

const isEnabled = (name: string): boolean => {
  const value = getEnv(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
};

const getPurposeProviderEnvName = (purpose: AiModelPurpose): string =>
  `AI_PROVIDER_${purpose.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;

const getSelectedProvider = (purpose?: AiModelPurpose): AiProvider => {
  const configured = [
    ...(purpose ? [getEnv(getPurposeProviderEnvName(purpose))] : []),
    ...PROVIDER_ENV.map((name) => getEnv(name)),
  ].find(Boolean);
  if (
    configured === "openai" ||
    configured === "google" ||
    configured === "openrouter"
  ) {
    return configured;
  }

  return "google";
};

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

const getTierDefault = (provider: AiProvider, tier: ModelTier): string => {
  if (provider === "google") return GOOGLE_TIER_DEFAULTS[tier];
  if (provider === "openrouter") return OPENROUTER_TIER_DEFAULTS[tier];
  return OPENAI_TIER_DEFAULTS[tier];
};

const getPurposeEnvName = (purpose: AiModelPurpose): string =>
  `AI_MODEL_${purpose.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;

const getTierEnvName = (tier: ModelTier): string =>
  tier === "critical" ? "AI_MODEL_CRITICAL" : "AI_MODEL_STANDARD";

const resolveModelName = ({
  provider,
  purpose,
  tier,
  modelName,
}: {
  provider: AiProvider;
  purpose?: AiModelPurpose;
  tier: ModelTier;
  modelName?: string;
}): string => {
  if (modelName?.trim()) return modelName.trim();

  const preferredModel = modelPreferenceStorage.getStore();
  if (provider === "google" && preferredModel) {
    return preferredModel;
  }

  const purposeModel = purpose
    ? (getEnv(getPurposeEnvName(purpose)) ??
      (provider === "openai"
        ? getEnv(LEGACY_OPENAI_PURPOSE_ENV[purpose] ?? "")
        : undefined))
    : undefined;

  return (
    purposeModel ??
    (provider === "openai"
      ? OPENAI_PURPOSE_DEFAULTS[purpose ?? "default"]
      : undefined) ??
    getEnv(getTierEnvName(tier)) ??
    (provider === "openai"
      ? tier === "critical"
        ? getEnv("OPENAI_MODEL_CRITICAL")
        : getEnv("OPENAI_MODEL_STANDARD")
      : undefined) ??
    getEnv("AI_MODEL") ??
    (provider === "openai" ? getEnv("OPENAI_MODEL") : undefined) ??
    getTierDefault(provider, tier)
  );
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
  modelName: string | null | undefined,
  callback: () => Promise<T>,
): Promise<T> => {
  const preferredModel = parseAiModelPreference(modelName);
  if (!preferredModel) {
    return callback();
  }

  return modelPreferenceStorage.run(preferredModel, callback);
};

export const getSearchToolsForSelectedProvider = (
  purpose?: AiModelPurpose,
): ToolSet => {
  if (!isEnabled("AI_ENABLE_SEARCH_TOOLS")) {
    return {};
  }

  const provider = getSelectedProvider(purpose);

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
    modelName: resolveModelName({ provider, tier }),
  });
};

export const getAiModelForPurpose = (
  purpose: AiModelPurpose,
  modelName?: string,
): LanguageModel | null => {
  const provider = getSelectedProvider(purpose);
  const apiKey = getProviderApiKey(provider);
  if (!apiKey) return null;

  const tier = PURPOSE_TIER[purpose];
  return createModel({
    provider,
    apiKey,
    modelName: resolveModelName({ provider, purpose, tier, modelName }),
  });
};

export const requireAiModelForPurpose = (
  purpose: AiModelPurpose,
  context: string,
  modelName?: string,
): LanguageModel => {
  const provider = getSelectedProvider(purpose);
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
