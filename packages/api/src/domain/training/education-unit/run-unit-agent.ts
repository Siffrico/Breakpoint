import type { ModelMessage } from "ai";
import type { z } from "zod/v4";
import { Effect } from "effect";

import type { ReasoningEffort } from "../engine/invoke-structured-model";
import type { AiModelPurpose } from "../engine/model-router";
import type { UnitAgentError } from "./agent-errors";
import {
  getErrorTag,
  getWorkspaceTurnPerformanceTimer,
} from "../../performance/workspace-turn-timing";
import { invokeStructuredModel } from "../engine/invoke-structured-model";
import {
  getAiModelMetadataForPurpose,
  requireStructuredAiModelForPurpose,
} from "../engine/model-router";
import {
  classifyUnitAgentFailure,
  nameUnitAgentSchemaError,
  UnitAgentFirstVisibleTimeoutError,
  UnitAgentWallClockTimeoutError,
} from "./agent-errors";

export interface UnitAgentResult<T> {
  readonly object: T;
}

interface RunUnitAgentInput<TSchema extends z.ZodTypeAny> {
  readonly agent: "mentor" | "reviewer";
  readonly purpose: AiModelPurpose;
  readonly system: string;
  readonly messages: readonly ModelMessage[];
  readonly context: string;
  readonly schema: TSchema;
  readonly schemaName: string;
  readonly maxOutputTokens: number;
  readonly errorMessage: string;
  readonly reasoning: ReasoningEffort;
  readonly onPartialAssistantMessage?: (content: string) => void;
  readonly renderPartialAssistantMessage?: (partial: unknown) => string;
}

const INITIAL_CHUNK_TIMEOUT_MS = 10_000;
const STREAM_INACTIVITY_TIMEOUT_MS = 10_000;
const FIRST_VISIBLE_TIMEOUT_MS = 5_000;
const WALL_CLOCK_TIMEOUT_MS = 90_000;
const MIN_VISIBLE_CHARACTERS = 24;

interface AttemptResult<T> extends UnitAgentResult<T> {
  readonly cachedInputTokens: number;
  readonly inputTokens: number;
}

const callModel = async <TSchema extends z.ZodTypeAny>(
  input: RunUnitAgentInput<TSchema>,
  parentSignal: AbortSignal,
): Promise<AttemptResult<z.infer<TSchema>>> => {
  const model = requireStructuredAiModelForPurpose(
    input.purpose,
    input.errorMessage,
  );
  const modelMetadata = getAiModelMetadataForPurpose(input.purpose);
  const performanceAttempt =
    getWorkspaceTurnPerformanceTimer()?.startModelAttempt({
      agent: input.agent,
      purpose: input.purpose,
      schemaName: input.schemaName,
      provider: modelMetadata.provider,
      model: modelMetadata.model,
    });
  const inactivityController = new AbortController();
  const firstVisibleController = new AbortController();
  const wallClockController = new AbortController();
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
  let firstVisibleTimer: ReturnType<typeof setTimeout> | undefined;
  let firstVisibleSatisfied = false;
  let receivedChunk = false;
  const armInactivityTimeout = () => {
    if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(
      () => {
        inactivityController.abort(
          new DOMException(
            "Unit agent stream became inactive.",
            "TimeoutError",
          ),
        );
      },
      receivedChunk ? STREAM_INACTIVITY_TIMEOUT_MS : INITIAL_CHUNK_TIMEOUT_MS,
    );
  };
  /**
   * Starts the "is anything visible yet" clock. It cannot start at call time:
   * reasoning tokens never reach `partialOutputStream`, so a thinking model
   * would abort before it had a chance to write a word. The clock begins at the
   * first chunk that is not part of the reasoning trace.
   */
  const armFirstVisibleTimeout = () => {
    if (firstVisibleSatisfied || firstVisibleTimer !== undefined) return;
    firstVisibleTimer = setTimeout(() => {
      firstVisibleController.abort(
        new UnitAgentFirstVisibleTimeoutError({
          message:
            "The AI did not begin a substantive reply within five seconds.",
        }),
      );
    }, FIRST_VISIBLE_TIMEOUT_MS);
  };
  const clearFirstVisibleTimeout = () => {
    firstVisibleSatisfied = true;
    if (firstVisibleTimer !== undefined) {
      clearTimeout(firstVisibleTimer);
      firstVisibleTimer = undefined;
    }
  };
  const abortSignal = AbortSignal.any([
    parentSignal,
    inactivityController.signal,
    firstVisibleController.signal,
    wallClockController.signal,
  ]);
  armInactivityTimeout();
  const wallClockTimer = setTimeout(() => {
    wallClockController.abort(
      new UnitAgentWallClockTimeoutError({
        message: "The AI took too long to produce a complete reply.",
      }),
    );
  }, WALL_CLOCK_TIMEOUT_MS);

  try {
    const result = invokeStructuredModel({
      model,
      schema: input.schema,
      schemaName: input.schemaName,
      system: input.system,
      prompt: [
        ...input.messages,
        { role: "user", content: input.context } as ModelMessage,
      ],
      cache: true,
      maxSteps: 1,
      maxOutputTokens: input.maxOutputTokens,
      abortSignal,
      reasoning: modelMetadata.disableStructuredReasoning
        ? "none"
        : input.reasoning,
      onChunk: ({ chunk }) => {
        receivedChunk = true;
        armInactivityTimeout();
        performanceAttempt?.markFirstChunk();
        if (!chunk.type.startsWith("reasoning")) armFirstVisibleTimeout();
      },
    });

    for await (const partial of result.partialOutputStream as AsyncIterable<unknown>) {
      if (abortSignal.aborted) throw abortSignal.reason;
      armInactivityTimeout();
      const assistantMessage = input.renderPartialAssistantMessage
        ? input.renderPartialAssistantMessage(partial)
        : typeof partial === "object" &&
            partial !== null &&
            "assistantMessage" in partial
          ? partial.assistantMessage
          : undefined;
      if (typeof assistantMessage === "string") {
        if (assistantMessage.trim().length >= MIN_VISIBLE_CHARACTERS) {
          clearFirstVisibleTimeout();
          performanceAttempt?.markFirstVisible();
        }
        input.onPartialAssistantMessage?.(assistantMessage);
      }
    }
    if (abortSignal.aborted) throw abortSignal.reason;

    const [object, usage] = await Promise.all([
      result.output,
      result.totalUsage,
    ]);
    performanceAttempt?.finish({
      outcome: "success",
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      inputTokens: usage.inputTokens ?? 0,
    });
    return {
      object: object as z.infer<TSchema>,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      inputTokens: usage.inputTokens ?? 0,
    };
  } catch (error) {
    performanceAttempt?.finish({
      outcome: "error",
      errorTag: getErrorTag(error),
    });
    if (firstVisibleController.signal.aborted) {
      throw firstVisibleController.signal.reason;
    }
    if (wallClockController.signal.aborted) {
      throw wallClockController.signal.reason;
    }
    throw error;
  } finally {
    if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
    if (firstVisibleTimer !== undefined) clearTimeout(firstVisibleTimer);
    clearTimeout(wallClockTimer);
  }
};

const attempt = <TSchema extends z.ZodTypeAny>(
  input: RunUnitAgentInput<TSchema>,
): Effect.Effect<AttemptResult<z.infer<TSchema>>, UnitAgentError> =>
  Effect.tryPromise({
    try: (signal) => callModel(input, signal),
    catch: classifyUnitAgentFailure,
  }).pipe(
    Effect.mapError((error) =>
      error._tag === "UnitAgentSchemaError"
        ? nameUnitAgentSchemaError(error, input.schemaName)
        : error,
    ),
  );

export const runUnitAgent = <TSchema extends z.ZodTypeAny>(
  input: RunUnitAgentInput<TSchema>,
): Effect.Effect<UnitAgentResult<z.infer<TSchema>>, UnitAgentError> =>
  attempt(input).pipe(
    Effect.tap(({ cachedInputTokens, inputTokens }) =>
      Effect.annotateCurrentSpan({ cachedInputTokens, inputTokens }),
    ),
    Effect.tap(() => Effect.annotateCurrentSpan({ outcome: "success" })),
    Effect.tapError((error) =>
      Effect.annotateCurrentSpan({ outcome: error._tag }),
    ),
    Effect.withSpan("unit-agent.attempt", {
      attributes: { agent: input.agent, attempt: 1 },
    }),
    Effect.map(({ object }) => ({ object })),
  );
