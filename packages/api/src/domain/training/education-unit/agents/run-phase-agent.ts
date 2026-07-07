// education-unit/agents/run-phase-agent.ts
//
// The one place a phase agent's model call happens and is retried. Every
// *-agent.ts file calls this instead of touching streamText/Effect.retry
// directly, so the retry policy stays in exactly one place.

import type { ModelMessage, ToolSet } from "ai";
import type { z } from "zod/v4";
import { Duration, Effect, Schedule } from "effect";

import type { AiModelPurpose } from "../../engine/model-router";
import type { PhaseAgentError } from "./errors";
import { invokeStructuredModel } from "../../engine/invoke-structured-model";
import { requireAiModelForPurpose } from "../../engine/model-router";
import { classifyPhaseAgentFailure, isRetryable } from "./errors";

export interface PhaseAgentToolCall {
  readonly toolName: string;
  readonly input: unknown;
}

export interface PhaseAgentResult<T> {
  readonly object: T;
  readonly toolCalls: readonly PhaseAgentToolCall[];
}

export interface RunPhaseAgentInput<TSchema extends z.ZodTypeAny> {
  readonly purpose: AiModelPurpose;
  readonly phase: "orient" | "connect" | "solve" | "teach";
  readonly system: string;
  readonly messages: ModelMessage[];
  readonly schema: TSchema;
  readonly schemaName: string;
  /** Omit for phases (orient/teach) that don't grade anything. */
  readonly tools?: ToolSet;
  readonly errorMessage: string;
  readonly onPartialAssistantMessage?: (content: string) => void;
}

const MAX_RESTARTS = 2;
const MAX_SCHEMA_REPAIRS = 1;
const PHASE_AGENT_TIMEOUT_MS = 45_000;

const callModel = async <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
  abortSignal: AbortSignal,
): Promise<PhaseAgentResult<z.infer<TSchema>>> => {
  const model = requireAiModelForPurpose(input.purpose, input.errorMessage);

  const result = invokeStructuredModel({
    model,
    schema: input.schema,
    schemaName: input.schemaName,
    system: input.system,
    prompt: input.messages,
    tools: input.tools,
    // A tool call + its result is a step; the structured reply that follows
    // is one more. 3 covers "call the grading tool, then answer" without
    // giving the model room to loop.
    maxSteps: 3,
    abortSignal,
  });

  const partialOutput = (async () => {
    const onPartial = input.onPartialAssistantMessage;
    if (!onPartial) return;
    const partials: AsyncIterable<unknown> = result.partialOutputStream;
    for await (const partial of partials) {
      // A timed-out attempt can keep draining while its retry is already
      // running; its signal is aborted, so its snapshots must not reach the
      // UI and interleave with the new attempt's.
      if (abortSignal.aborted) return;
      const assistantMessage =
        typeof partial === "object" &&
        partial !== null &&
        "assistantMessage" in partial
          ? partial.assistantMessage
          : undefined;
      if (typeof assistantMessage === "string") {
        onPartial(assistantMessage);
      }
    }
  })();

  const [object, toolCalls] = await Promise.all([
    result.output,
    result.toolCalls,
    partialOutput,
  ]);

  return {
    object: object as z.infer<TSchema>,
    toolCalls: toolCalls.map((call) => ({
      toolName: call.toolName,
      input: call.input as unknown,
    })),
  };
};

const attempt = <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
): Effect.Effect<PhaseAgentResult<z.infer<TSchema>>, PhaseAgentError> =>
  Effect.tryPromise({
    try: (signal) =>
      callModel(
        input,
        AbortSignal.any([signal, AbortSignal.timeout(PHASE_AGENT_TIMEOUT_MS)]),
      ),
    catch: classifyPhaseAgentFailure,
  });

const tracedAttempt = <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
  attemptNumber: number,
) =>
  attempt(input).pipe(
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
  );

// Exponential backoff capped at MAX_RESTARTS attempts — only ever applied to
// AgentTimeoutError/AgentTransientProviderError (see isRetryable); a call that just
// didn't land is worth retrying unmodified, unlike a schema failure.
// v4 renamed Schedule.intersect -> Schedule.both (same "continue only while
// both recur, take the max delay" semantics). The tuple output it now emits is
// unused: retry gates on the `while` error predicate, not the schedule output.
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
      content: `Your previous response did not match the required schema or tool contract (${error.message}). Respond again, strictly matching the schema, and only call the grading tool with valid arguments.`,
    },
  ],
});

/**
 * Runs one phase-agent model call with typed, tag-driven retry:
 *   - AgentTimeoutError / AgentTransientProviderError -> restart with the same input,
 *     up to MAX_RESTARTS times with exponential backoff (the call just didn't
 *     land — nothing about the input was wrong).
 *   - AgentSchemaError -> one repair pass with a corrective instruction
 *     appended to the transcript (the model answered, just not validly).
 *   - AgentProviderRejectedError -> not retried here.
 * Exhausting a budget fails with the tagged error; the caller decides the
 * turn-failed UX, this function never guesses a fallback response.
 */
export const runPhaseAgent = <TSchema extends z.ZodTypeAny>(
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
          ? runPhaseAgent(withRepairInstruction(input, error), repairsLeft - 1)
          : Effect.fail(error),
      ),
    );
  });
