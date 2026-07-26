// education-unit/agents/run-phase-agent.ts
//
// The one place a phase agent's model call happens and is retried. Every
// *-agent.ts file calls this instead of touching streamText/Effect.retry
// directly, so the retry policy stays in exactly one place.

import type { ModelMessage } from "ai";
import type { z } from "zod/v4";
import { Duration, Effect, Schedule } from "effect";

import type { AiModelPurpose } from "../../engine/model-router";
import type { PhaseAgentError } from "./errors";
import { invokeStructuredModel } from "../../engine/invoke-structured-model";
import { requireAiModelForPurpose } from "../../engine/model-router";
import {
  AgentFirstVisibleTimeoutError,
  classifyPhaseAgentFailure,
  isRetryable,
} from "./errors";
import { buildTurnDirective } from "./system-prompt";

export interface PhaseAgentResult<T> {
  readonly object: T;
}

export interface RunPhaseAgentInput<TSchema extends z.ZodTypeAny> {
  readonly purpose: AiModelPurpose;
  readonly phase: "orient" | "connect" | "solve" | "teach";
  readonly system: string;
  readonly messages: ModelMessage[];
  readonly instruction: string;
  readonly contextBlock: string;
  readonly schema: TSchema;
  readonly schemaName: string;
  readonly errorMessage: string;
  readonly onPartialAssistantMessage?: (content: string) => void;
}

const MAX_RESTARTS = 1;
const MAX_SCHEMA_REPAIRS = 1;
const PHASE_AGENT_INACTIVITY_TIMEOUT_MS = 10_000;
const PHASE_AGENT_FIRST_VISIBLE_TIMEOUT_MS = 5_000;
const MIN_STREAMED_VISIBLE_CHARACTERS = 24;
const PHASE_OUTPUT_TOKEN_BUDGET = {
  orient: 1_000,
  connect: 2_600,
  solve: 2_200,
  teach: 2_600,
} as const;

interface PhaseAgentAttemptResult<T> extends PhaseAgentResult<T> {
  readonly cachedInputTokens: number;
  readonly inputTokens: number;
}

const callModel = async <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
  parentSignal: AbortSignal,
): Promise<PhaseAgentAttemptResult<z.infer<TSchema>>> => {
  const model = requireAiModelForPurpose(input.purpose, input.errorMessage);
  const inactivityController = new AbortController();
  const firstVisibleController = new AbortController();
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
  let firstVisibleTimer: ReturnType<typeof setTimeout> | undefined;
  const armInactivityTimeout = () => {
    if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      inactivityController.abort(
        new DOMException("Phase agent stream became inactive.", "TimeoutError"),
      );
    }, PHASE_AGENT_INACTIVITY_TIMEOUT_MS);
  };
  const abortSignal = AbortSignal.any([
    parentSignal,
    inactivityController.signal,
    firstVisibleController.signal,
  ]);
  armInactivityTimeout();
  firstVisibleTimer = setTimeout(() => {
    firstVisibleController.abort(
      new AgentFirstVisibleTimeoutError({
        message: "The AI did not begin a substantive reply within five seconds.",
      }),
    );
  }, PHASE_AGENT_FIRST_VISIBLE_TIMEOUT_MS);

  try {
    const result = invokeStructuredModel({
      model,
      schema: input.schema,
      schemaName: input.schemaName,
      system: input.system,
      prompt: input.messages,
      cache: true,
      maxSteps: 1,
      maxOutputTokens: PHASE_OUTPUT_TOKEN_BUDGET[input.phase],
      abortSignal,
      onChunk: armInactivityTimeout,
      providerOptions: {
        openrouter: {
          reasoning: { enabled: false, effort: "none" },
        },
      },
    });

    const partials: AsyncIterable<unknown> = result.partialOutputStream;
    for await (const partial of partials) {
      if (abortSignal.aborted) throw abortSignal.reason;
      armInactivityTimeout();
      const assistantMessage =
        typeof partial === "object" &&
        partial !== null &&
        "assistantMessage" in partial
          ? partial.assistantMessage
          : undefined;
      if (typeof assistantMessage === "string") {
        if (
          firstVisibleTimer !== undefined &&
          assistantMessage.trim().length >= MIN_STREAMED_VISIBLE_CHARACTERS
        ) {
          clearTimeout(firstVisibleTimer);
          firstVisibleTimer = undefined;
        }
        input.onPartialAssistantMessage?.(assistantMessage);
      }
    }
    if (abortSignal.aborted) throw abortSignal.reason;

    const [object, usage] = await Promise.all([
      result.output,
      result.totalUsage,
    ]);

    return {
      object: object as z.infer<TSchema>,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      inputTokens: usage.inputTokens ?? 0,
    };
  } catch (error) {
    if (firstVisibleController.signal.aborted) {
      throw firstVisibleController.signal.reason;
    }
    throw error;
  } finally {
    if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
    if (firstVisibleTimer !== undefined) clearTimeout(firstVisibleTimer);
  }
};

const attempt = <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
): Effect.Effect<PhaseAgentAttemptResult<z.infer<TSchema>>, PhaseAgentError> =>
  Effect.tryPromise({
    try: (signal) => callModel(input, signal),
    catch: classifyPhaseAgentFailure,
  });

const tracedAttempt = <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
  attemptNumber: number,
) =>
  attempt(input).pipe(
    Effect.tap(({ cachedInputTokens, inputTokens }) =>
      Effect.annotateCurrentSpan({ cachedInputTokens, inputTokens }),
    ),
    Effect.tap(() => Effect.annotateCurrentSpan({ outcome: "success" })),
    Effect.tapError((error) =>
      Effect.annotateCurrentSpan({ outcome: error._tag }),
    ),
    Effect.withSpan("phase-agent.attempt", {
      attributes: {
        purpose: input.purpose,
        phase: input.phase,
        attempt: attemptNumber,
      },
    }),
    Effect.map(({ object }) => ({ object })),
  );

const RESTART_SCHEDULE = Schedule.exponential(Duration.millis(200), 2).pipe(
  Schedule.both(Schedule.recurs(MAX_RESTARTS)),
);

const withRepairInstruction = <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
  error: PhaseAgentError,
): RunPhaseAgentInput<TSchema> => ({
  ...input,
  messages: [
    ...input.messages,
    {
      role: "user",
      content: `Your previous response did not match the required output contract (${error.message}). Respond again with exactly one valid object. Put assistantMessage first, and keep all grading evidence and scenario data out of assistantMessage.`,
    },
  ],
});

/**
 * Runs one phase-agent model call with typed, tag-driven retry:
 *   - timeout/transient provider failures restart once with the same input;
 *   - schema failures get one corrective repair attempt;
 *   - provider rejections are surfaced immediately.
 */
const runPreparedPhaseAgent = <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
  repairsLeft = MAX_SCHEMA_REPAIRS,
): Effect.Effect<PhaseAgentResult<z.infer<TSchema>>, PhaseAgentError> =>
  Effect.suspend(() => {
    let attemptNumber = 0;
    return Effect.retry(
      Effect.suspend(() => tracedAttempt(input, ++attemptNumber)),
      {
        schedule: RESTART_SCHEDULE,
        while: isRetryable,
      },
    ).pipe(
      Effect.catchTag("AgentSchemaError", (error) =>
        repairsLeft > 0
          ? runPreparedPhaseAgent(
              withRepairInstruction(input, error),
              repairsLeft - 1,
            )
          : Effect.fail(error),
      ),
    );
  });

export const runPhaseAgent = <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
): Effect.Effect<PhaseAgentResult<z.infer<TSchema>>, PhaseAgentError> =>
  runPreparedPhaseAgent({
    ...input,
    messages: [
      ...input.messages,
      {
        role: "user",
        content: buildTurnDirective(input.instruction, input.contextBlock),
      },
    ],
  });
