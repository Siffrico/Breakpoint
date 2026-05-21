import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

import type { ModelTier } from "../prompts/types";

type AiProvider = "google" | "openai";

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
  | "default";

const GOOGLE_TIER_DEFAULTS: Record<ModelTier, string> = {
  critical: "gemini-3.5-flash",
  standard: "gemini-3.5-flash",
};

const OPENAI_TIER_DEFAULTS: Record<ModelTier, string> = {
  critical: "gpt-4.1",
  standard: "gpt-4.1-mini",
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
};

const PROVIDER_ENV = ["AI_PROVIDER", "AI_MODEL_PROVIDER"] as const;

const getEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const getSelectedProvider = (): AiProvider => {
  const configured = PROVIDER_ENV.map((name) => getEnv(name)).find(Boolean);
  if (configured === "openai" || configured === "google") {
    return configured;
  }

  return "google";
};

const getProviderApiKey = (provider: AiProvider): string | undefined =>
  provider === "google"
    ? getEnv("GOOGLE_GENERATIVE_AI_API_KEY")
    : getEnv("OPENAI_API_KEY");

const getProviderMissingKeyMessage = (
  provider: AiProvider,
  context: string,
): string =>
  provider === "google"
    ? `GOOGLE_GENERATIVE_AI_API_KEY is required for ${context}.`
    : `OPENAI_API_KEY is required for ${context}.`;

const getTierDefault = (provider: AiProvider, tier: ModelTier): string =>
  provider === "google"
    ? GOOGLE_TIER_DEFAULTS[tier]
    : OPENAI_TIER_DEFAULTS[tier];

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

  const purposeModel = purpose
    ? (getEnv(getPurposeEnvName(purpose)) ??
      (provider === "openai"
        ? getEnv(LEGACY_OPENAI_PURPOSE_ENV[purpose] ?? "")
        : undefined))
    : undefined;

  return (
    purposeModel ??
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

  return createOpenAI({ apiKey })(modelName);
};

export const getAiProvider = (): AiProvider => getSelectedProvider();

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
  const provider = getSelectedProvider();
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
