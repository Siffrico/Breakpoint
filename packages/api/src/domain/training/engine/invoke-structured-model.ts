import type {
  LanguageModelUsage,
  ModelMessage,
  StreamTextResult,
  ToolSet,
} from "ai";
import type { z } from "zod/v4";
import {
  NoObjectGeneratedError,
  Output,
  parsePartialJson,
  stepCountIs,
  streamText,
  tool,
} from "ai";

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

export interface StructuredModelResult<T> {
  readonly partialOutputStream: AsyncIterable<unknown>;
  readonly output: PromiseLike<T>;
  readonly totalUsage: PromiseLike<LanguageModelUsage>;
}

const SUBMIT_TOOL_NAME = "submit_structured_output";
const SUBMIT_TOOL_INSTRUCTION = `Finish by calling submit_structured_output exactly once. Put the complete final response in that tool call. Do not write the final response as ordinary text.`;

const createToolPartialOutputStream = async function* (
  fullStream: AsyncIterable<{
    readonly type: string;
    readonly id?: string;
    readonly toolName?: string;
    readonly delta?: string;
    readonly input?: unknown;
  }>,
): AsyncIterable<unknown> {
  let submissionId: string | undefined;
  let inputText = "";

  for await (const part of fullStream) {
    if (
      part.type === "tool-input-start" &&
      part.toolName === SUBMIT_TOOL_NAME
    ) {
      submissionId = part.id;
      continue;
    }
    if (
      part.type === "tool-input-delta" &&
      part.id === submissionId &&
      part.delta
    ) {
      inputText += part.delta;
      const parsed = await parsePartialJson(inputText);
      if (parsed.value !== undefined) yield parsed.value;
      continue;
    }
    if (
      part.type === "tool-call" &&
      part.toolName === SUBMIT_TOOL_NAME &&
      part.input !== undefined &&
      inputText.length === 0
    ) {
      yield part.input;
    }
  }
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
  reasoningBudgetTokens,
  temperature,
  outputMode = "object",
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
  temperature?: number;
  /** Explicit effort for this call; overrides the profile's budget mapping. */
  reasoning?: ReasoningEffort;
  /** Caps OpenRouter thinking so reasoning cannot consume the final answer. */
  reasoningBudgetTokens?: number;
  outputMode?: "object" | "tool";
}): StructuredModelResult<z.infer<TSchema>> => {
  const reasoningOptions = (() => {
    const effort =
      reasoning ??
      (profile && profile.reasoningBudgetTokens > 0
        ? effortForBudget(profile.reasoningBudgetTokens)
        : undefined);
    return mergeProviderOptions(
      providerOptions,
      effort === undefined
        ? undefined
        : getReasoningProviderOptions(
            effort,
            reasoningBudgetTokens ??
              (reasoning === undefined
                ? profile?.reasoningBudgetTokens
                : undefined),
          ),
    );
  })();
  const effectiveSystem =
    outputMode === "tool" ? `${system}\n\n${SUBMIT_TOOL_INSTRUCTION}` : system;
  const promptSettings =
    cache && Array.isArray(prompt)
      ? {
          prompt: withCacheBreakpoints([
            {
              role: "system" as const,
              content: effectiveSystem,
              providerOptions: CACHE_CONTROL_PROVIDER_OPTIONS,
            },
            ...prompt,
          ]),
        }
      : { system: effectiveSystem, prompt };
  const outputTokens = profile
    ? profile.maxOutputTokens + profile.reasoningBudgetTokens
    : maxOutputTokens;

  if (outputMode === "tool") {
    if (tools && Object.keys(tools).length > 0) {
      throw new Error(
        "Tool-submitted structured output cannot share a one-step call with other tools.",
      );
    }
    if (maxSteps !== 1) {
      throw new Error(
        "Tool-submitted structured output must use one model step.",
      );
    }

    const submissionTool = tool({
      description:
        "Submit the complete final response after checking it against every field description and constraint.",
      inputSchema: schema,
      strict: true,
    });
    const result = streamText({
      model,
      ...promptSettings,
      tools: { [SUBMIT_TOOL_NAME]: submissionTool },
      toolChoice: { type: "tool", toolName: SUBMIT_TOOL_NAME },
      stopWhen: stepCountIs(1),
      maxRetries: 0,
      abortSignal,
      onChunk,
      ...(outputTokens !== undefined ? { maxOutputTokens: outputTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(reasoningOptions ? { providerOptions: reasoningOptions } : {}),
    });
    const output = Promise.resolve(result.toolCalls).then(async (calls) => {
      const submission = calls.find(
        (call) => call.toolName === SUBMIT_TOOL_NAME,
      );
      if (submission) return schema.parse(submission.input);

      const [response, usage, finishReason, text] = await Promise.all([
        result.response,
        result.usage,
        result.finishReason,
        result.text,
      ]);
      throw new NoObjectGeneratedError({
        message: "The model did not submit the required structured output.",
        text,
        response,
        usage,
        finishReason,
      });
    });

    return {
      partialOutputStream: createToolPartialOutputStream(result.fullStream),
      output,
      totalUsage: result.totalUsage,
    };
  }

  const objectOutput = Output.object({
    schema,
    name: schemaName,
  });

  const result = streamText({
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
    ...promptSettings,
    tools,
    stopWhen: stepCountIs(maxSteps),
    maxRetries: 0,
    abortSignal,
    onChunk,
    ...(outputTokens !== undefined ? { maxOutputTokens: outputTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(reasoningOptions ? { providerOptions: reasoningOptions } : {}),
  });
  return {
    partialOutputStream: result.partialOutputStream,
    output: result.output as PromiseLike<z.infer<TSchema>>,
    totalUsage: result.totalUsage,
  };
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
    maxRetries: 0,
    abortSignal,
    onChunk,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    providerOptions: getReasoningProviderOptions(reasoning),
  });
