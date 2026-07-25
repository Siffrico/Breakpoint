import type { ModelMessage, StreamTextResult, ToolSet } from "ai";
import type { z } from "zod/v4";
import { Output, smoothStream, stepCountIs, streamText } from "ai";

import type { RunProfile } from "./run-profiles";
import {
  CACHE_CONTROL_PROVIDER_OPTIONS,
  withCacheBreakpoints,
} from "./prompt-cache";

type StructuredModel = Parameters<typeof streamText>[0]["model"];
type StructuredOnChunk = Parameters<typeof streamText>[0]["onChunk"];

const getReasoningProviderOptions = (budget: number) => {
  const effort = budget >= 8_192 ? "high" : budget >= 4_096 ? "medium" : "low";
  return {
    openai: { reasoningEffort: effort, reasoningSummary: "auto" as const },
    google: {
      // Gemini 3 uses thinkingLevel; older Gemini models ignore it and retain
      // their provider default rather than receiving an invalid token budget.
      thinkingConfig: { thinkingLevel: effort, includeThoughts: true },
    },
    openrouter: { reasoning: { enabled: true, max_tokens: budget } },
  };
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
  smoothPartials = false,
  abortSignal,
  onChunk,
}: {
  model: StructuredModel;
  schema: TSchema;
  schemaName: string;
  system: string;
  prompt: string | ModelMessage[];
  tools?: ToolSet;
  maxSteps: number;
  /** Artifact agents pass their run profile; interactive turns omit it. */
  profile?: RunProfile;
  cache?: boolean;
  /** Pace partial-output deltas for checkpoint streaming (resilient agent). */
  smoothPartials?: boolean;
  abortSignal?: AbortSignal;
  onChunk?: StructuredOnChunk;
}): StreamTextResult<
  ToolSet,
  ReturnType<typeof Output.object<z.infer<TSchema>>>
> =>
  streamText({
    model,
    output: Output.object({ schema, name: schemaName }),
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
    ...(smoothPartials
      ? {
          experimental_transform: smoothStream({
            delayInMs: 15,
            chunking: "word",
          }),
        }
      : {}),
    ...(profile
      ? {
          maxOutputTokens:
            profile.maxOutputTokens + profile.reasoningBudgetTokens,
        }
      : {}),
    ...(profile && profile.reasoningBudgetTokens > 0
      ? {
          providerOptions: getReasoningProviderOptions(
            profile.reasoningBudgetTokens,
          ),
        }
      : {}),
  });
