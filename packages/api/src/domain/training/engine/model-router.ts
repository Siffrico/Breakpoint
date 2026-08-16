import { AsyncLocalStorage } from "node:async_hooks";
import type { LanguageModel, ToolSet } from "ai";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import type { AiModelPreference } from "@acme/validators";
import { AiModelPreferenceSchema, DEFAULT_AI_MODEL } from "@acme/validators";

import type { ModelTier } from "../prompts/types";
import type { AiModelPurpose } from "./run-profiles";
import { getRunProfile } from "./run-profiles";

export type { AiModelPurpose };

type AiProvider = "google" | "openai" | "openrouter";

interface ModelStack {
  provider: AiProvider;
  models: Record<ModelTier, string>;
}

/**
 * Resolves each learner-selectable model to the provider and per-tier model ids
 * the router instantiates. `critical` runs high-stakes turns (curriculum,
 * grading); `standard` runs cheaper turns (recall, tutor). Only GPT ships a
 * distinct standard tier; the others reuse one model across both tiers.
 */
const PREFERENCE_STACKS: Record<AiModelPreference, ModelStack> = {
  "glm-5.2": {
    provider: "openrouter",
    models: { critical: "z-ai/glm-5.2", standard: "z-ai/glm-5.2" },
  },
  "deepseek-v4-flash-0731": {
    provider: "openrouter",
    models: {
      critical: "deepseek/deepseek-v4-flash-0731",
      standard: "deepseek/deepseek-v4-flash-0731",
    },
  },
  "deepseek-v4-pro-0813": {
    provider: "openrouter",
    models: {
      critical: "deepseek/deepseek-v4-pro-0813",
      standard: "deepseek/deepseek-v4-pro-0813",
    },
  },
  "gpt-5.5": {
    provider: "openai",
    models: { critical: "gpt-5.5", standard: "gpt-5.5-mini" },
  },
  "gemini-3.5-flash": {
    provider: "google",
    models: { critical: "gemini-3.5-flash", standard: "gemini-3.5-flash" },
  },
};

/**
 * The learner's model choice for the current request, set by
 * `withAiModelPreference` around each streaming turn. Background jobs run
 * outside any wrapper, so `getStore()` is undefined and routing falls back to
 * DEFAULT_AI_MODEL.
 */
const preferenceStore = new AsyncLocalStorage<AiModelPreference>();

const getActiveStack = (): ModelStack =>
  PREFERENCE_STACKS[preferenceStore.getStore() ?? DEFAULT_AI_MODEL];

export const getModelTierForPurpose = (purpose: AiModelPurpose): ModelTier =>
  getRunProfile(purpose).tier;

const getEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  return value;
};

const isEnabled = (name: string): boolean => {
  const value = getEnv(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
};

const getSelectedProvider = (): AiProvider => getActiveStack().provider;

const resolveModelName = (tier: ModelTier): string =>
  getActiveStack().models[tier];

export const getAiModelMetadataForPurpose = (purpose: AiModelPurpose) => ({
  provider: getSelectedProvider(),
  model: resolveModelName(getModelTierForPurpose(purpose)),
});

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

/**
 * Runs `callback` with the learner's model preference bound for its entire async
 * lifetime. `createUIMessageStream` invokes its `execute` synchronously, so the
 * bound store propagates into the streamed model calls even though this resolves
 * before the stream is consumed. Falls through unchanged when no valid
 * preference is supplied.
 */
export const withAiModelPreference = <T>(
  modelName: string | null | undefined,
  callback: () => Promise<T>,
): Promise<T> => {
  const parsed = AiModelPreferenceSchema.safeParse(modelName);
  return parsed.success
    ? preferenceStore.run(parsed.data, callback)
    : callback();
};

export const getSearchToolsForSelectedProvider = (
  purpose: AiModelPurpose = "default",
): ToolSet => {
  if (isEnabled("AI_DISABLE_SEARCH_TOOLS")) {
    return {};
  }

  if (!getRunProfile(purpose).search) return {};

  const provider = getSelectedProvider();

  if (provider === "openai") {
    return {
      web_search: openai.tools.webSearch({
        searchContextSize: "high",
      }),
    } as unknown as ToolSet;
  }

  if (provider === "openrouter") {
    const openrouter = createOpenRouter({
      apiKey: getProviderApiKey("openrouter"),
    });
    return {
      web_search: openrouter.tools.webSearch({ maxResults: 5 }),
    } as unknown as ToolSet;
  }

  return {
    google_search: google.tools.googleSearch({}),
  } as unknown as ToolSet;
};

/**
 * Search tools for calls that also demand `Output.object` structured output.
 * OpenRouter's web_search server tool makes models ignore the json_schema
 * response format (verified against glm-5.2: it answers in markdown prose and
 * every call dies with AI_JSONParseError), so structured calls carry no tools
 * there — search instead rides on the model itself as the `web` plugin, which
 * preserves the response format (see requireStructuredAiModelForPurpose).
 * Other providers keep their normal search tools.
 */
export const getSearchToolsForStructuredOutput = (
  purpose: AiModelPurpose = "default",
): ToolSet =>
  getSelectedProvider() === "openrouter"
    ? {}
    : getSearchToolsForSelectedProvider(purpose);

/**
 * Model for structured-output calls, with search kept intact on OpenRouter:
 * the `web` plugin is attached at the model level (server-side search result
 * injection) rather than as a tool, because the plugin coexists with
 * json_schema response formats while the web_search server tool breaks them
 * (verified against glm-5.2: plugin call returned url citations AND a
 * schema-valid object). Non-search purposes and other providers resolve
 * exactly as requireAiModelForPurpose.
 */
export const requireStructuredAiModelForPurpose = (
  purpose: AiModelPurpose,
  context: string,
): LanguageModel => {
  const provider = getSelectedProvider();
  const searchWanted =
    getRunProfile(purpose).search && !isEnabled("AI_DISABLE_SEARCH_TOOLS");
  if (provider !== "openrouter" || !searchWanted) {
    return requireAiModelForPurpose(purpose, context);
  }
  const apiKey = getProviderApiKey("openrouter");
  if (!apiKey) {
    throw new Error(getProviderMissingKeyMessage("openrouter", context));
  }
  return createOpenRouter({ apiKey })(
    resolveModelName(getModelTierForPurpose(purpose)),
    { plugins: [{ id: "web", max_results: 5 }] },
  );
};

export const getAiModelForTier = (tier: ModelTier): LanguageModel | null => {
  const provider = getSelectedProvider();
  const apiKey = getProviderApiKey(provider);
  if (!apiKey) return null;

  return createModel({ provider, apiKey, modelName: resolveModelName(tier) });
};

export const getAiModelForPurpose = (
  purpose: AiModelPurpose,
): LanguageModel | null => getAiModelForTier(getModelTierForPurpose(purpose));

export const requireAiModelForPurpose = (
  purpose: AiModelPurpose,
  context: string,
): LanguageModel => {
  const model = getAiModelForPurpose(purpose);
  if (!model) {
    throw new Error(
      getProviderMissingKeyMessage(getSelectedProvider(), context),
    );
  }

  return model;
};

export const getMissingAiKeyMessage = (context: string): string =>
  getProviderMissingKeyMessage(getSelectedProvider(), context);
