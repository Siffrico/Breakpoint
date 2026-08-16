import type { ModelMessage, StreamTextResult, ToolSet } from "ai";
import type { z } from "zod/v4";
import { Output, stepCountIs, streamText } from "ai";

import type { RunProfile } from "./run-profiles";
import {
  CACHE_CONTROL_PROVIDER_OPTIONS,
  withCacheBreakpoints,
} from "./prompt-cache";

type AiModel = Parameters<typeof streamText>[0]["model"];
type ModelOnChunk = Parameters<typeof streamText>[0]["onChunk"];

type ProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]["providerOptions"]
>;

/**
 * How hard a call should think. `ai@6` still has no portable top-level
 * `reasoning` setting, so this is the one place the three providers' spellings
 * are reconciled — callers name an effort, never a vendor key.
 */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

const effortForBudget = (budget: number): ReasoningEffort =>
  budget >= 8_192 ? "high" : budget >= 4_096 ? "medium" : "low";

const getReasoningProviderOptions = (
  effort: ReasoningEffort,
  budget?: number,
): ProviderOptions =>
  effort === "none"
    ? {
        openai: { reasoningEffort: "minimal" },
        google: {
          thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
        },
        openrouter: { reasoning: { enabled: false } },
      }
    : {
        openai: { reasoningEffort: effort, reasoningSummary: "auto" },
        google: {
          // Gemini 3 uses thinkingLevel; older Gemini models ignore it and
          // retain their provider default rather than receiving an invalid
          // token budget.
          thinkingConfig: { thinkingLevel: effort, includeThoughts: true },
        },
        openrouter:
          budget === undefined
            ? { reasoning: { enabled: true, effort } }
            : { reasoning: { enabled: true, max_tokens: budget } },
      };

/**
 * Per-provider merge. A whole-object spread here would silently drop a
 * caller's provider options the moment a reasoning effort is also set — the
 * two configure different keys under the same provider and both must survive.
 */
const mergeProviderOptions = (
  base: ProviderOptions | undefined,
  overrides: ProviderOptions | undefined,
): ProviderOptions | undefined => {
  if (!base) return overrides;
  if (!overrides) return base;
  const merged: ProviderOptions = { ...base };
  for (const [provider, options] of Object.entries(overrides)) {
    merged[provider] = { ...merged[provider], ...options };
  }
  return merged;
};

export const extractFirstJsonObject = (text: string): string => {
  const start = text.indexOf("{");
  if (start === -1) return text;

  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (insideString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        insideString = false;
      }
      continue;
    }

    if (character === '"') {
      insideString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return text.slice(start);
};

/**
 * The one place a structured-output model call is constructed. Retry policy,
 * prompt content, and error classification belong to the callers — this owns
 * only the invocation so step budgets, reasoning options, and output wiring
 * cannot drift between the interactive and artifact policies.
 */
export const invokeStructuredModel = <TSchema extends z.ZodTypeAny>({
  model,
  schema,
  schemaName,
  system,
  prompt,
  tools,
  maxSteps,
  profile,
  cache = false,
  abortSignal,
  onChunk,
  providerOptions,
  maxOutputTokens,
  reasoning,
}: {
  model: AiModel;
  schema: TSchema;
  schemaName: string;
  system: string;
  prompt: string | ModelMessage[];
  tools?: ToolSet;
  maxSteps: number;
  /** Artifact agents pass their run profile; interactive turns omit it. */
  profile?: RunProfile;
  cache?: boolean;
  abortSignal?: AbortSignal;
  onChunk?: ModelOnChunk;
  providerOptions?: Parameters<typeof streamText>[0]["providerOptions"];
  maxOutputTokens?: number;
  /** Explicit effort for this call; overrides the profile's budget mapping. */
  reasoning?: ReasoningEffort;
}): StreamTextResult<
  ToolSet,
  ReturnType<typeof Output.object<z.infer<TSchema>>>
> => {
  const objectOutput = Output.object({
    schema,
    name: schemaName,
  });

  return streamText({
    model,
    output: {
      ...objectOutput,
      parseCompleteOutput: ({ text }, context) =>
        objectOutput.parseCompleteOutput(
          { text: extractFirstJsonObject(text) },
          context,
        ),
      parsePartialOutput: ({ text }) =>
        objectOutput.parsePartialOutput({
          text: extractFirstJsonObject(text),
        }),
    },
    ...(cache && Array.isArray(prompt)
      ? {
          prompt: withCacheBreakpoints([
            {
              role: "system",
              content: system,
              providerOptions: CACHE_CONTROL_PROVIDER_OPTIONS,
            },
            ...prompt,
          ]),
        }
      : { system, prompt }),
    tools,
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
    onChunk,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(profile
      ? {
          maxOutputTokens:
            profile.maxOutputTokens + profile.reasoningBudgetTokens,
        }
      : {}),
    ...(() => {
      const effort =
        reasoning ??
        (profile && profile.reasoningBudgetTokens > 0
          ? effortForBudget(profile.reasoningBudgetTokens)
          : undefined);
      const resolved = mergeProviderOptions(
        providerOptions,
        effort === undefined
          ? undefined
          : getReasoningProviderOptions(
              effort,
              // An explicit effort names the dial directly; only the profile
              // path expresses itself as an OpenRouter token budget.
              reasoning === undefined
                ? profile?.reasoningBudgetTokens
                : undefined,
            ),
      );
      return resolved ? { providerOptions: resolved } : {};
    })(),
  });
};

export const invokeTextModel = ({
  model,
  system,
  prompt,
  cache = false,
  abortSignal,
  onChunk,
  maxOutputTokens,
  reasoning,
}: {
  model: AiModel;
  system: string;
  prompt: string | ModelMessage[];
  cache?: boolean;
  abortSignal?: AbortSignal;
  onChunk?: ModelOnChunk;
  maxOutputTokens?: number;
  reasoning: ReasoningEffort;
}): StreamTextResult<ToolSet, ReturnType<typeof Output.text>> =>
  streamText({
    model,
    ...(cache && Array.isArray(prompt)
      ? {
          prompt: withCacheBreakpoints([
            {
              role: "system",
              content: system,
              providerOptions: CACHE_CONTROL_PROVIDER_OPTIONS,
            },
            ...prompt,
          ]),
        }
      : { system, prompt }),
    stopWhen: stepCountIs(1),
    abortSignal,
    onChunk,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    providerOptions: getReasoningProviderOptions(reasoning),
  });
