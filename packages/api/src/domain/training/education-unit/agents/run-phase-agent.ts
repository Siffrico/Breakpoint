// education-unit/agents/run-phase-agent.ts
//
// The one place a phase agent's model call happens and is retried. Every
// *-agent.ts file calls this instead of touching streamText/Effect.retry
// directly, so the retry policy stays in exactly one place.

import type { ModelMessage, ToolSet } from "ai";
import { Output, stepCountIs, streamText } from "ai";
import { Duration, Effect, Schedule } from "effect";
import type { z } from "zod/v4";

import type { AiModelPurpose } from "../../engine/model-router";
import { requireAiModelForPurpose } from "../../engine/model-router";
import type { PhaseAgentError } from "./errors";
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
  readonly system: string;
  readonly messages: ModelMessage[];
  readonly schema: TSchema;
  readonly schemaName: string;
  /** Omit for phases (orient/teach) that don't grade anything. */
  readonly tools?: ToolSet;
  readonly errorMessage: string;
}

const MAX_RESTARTS = 2;
const MAX_SCHEMA_REPAIRS = 1;

const callModel = async <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
): Promise<PhaseAgentResult<z.infer<TSchema>>> => {
  const model = requireAiModelForPurpose(input.purpose, input.errorMessage);

  const result = streamText({
    model,
    output: Output.object({ schema: input.schema, name: input.schemaName }),
    system: input.system,
    prompt: input.messages,
    tools: input.tools,
    // A tool call + its result is a step; the structured reply that follows
    // is one more. 3 covers "call the grading tool, then answer" without
    // giving the model room to loop.
    stopWhen: stepCountIs(3),
  });

  const [object, toolCalls] = await Promise.all([
    result.output,
    result.toolCalls,
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
    try: () => callModel(input),
    catch: classifyPhaseAgentFailure,
  });

// Exponential backoff capped at MAX_RESTARTS attempts — only ever applied to
// AgentTimeoutError/AgentProviderError (see isRetryable); a call that just
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
 *   - AgentTimeoutError / AgentProviderError -> restart with the same input,
 *     up to MAX_RESTARTS times with exponential backoff (the call just didn't
 *     land — nothing about the input was wrong).
 *   - AgentSchemaError -> one repair pass with a corrective instruction
 *     appended to the transcript (the model answered, just not validly).
 *   - AgentPartialOutputError -> not retried here. Phase-agent turns are
 *     short, single-shot structured calls, not a resumable long-form
 *     generation like the artifact agents in orchestration/agent-runtime.ts.
 * Exhausting a budget fails with the tagged error; the caller decides the
 * turn-failed UX, this function never guesses a fallback response.
 */
export const runPhaseAgent = <TSchema extends z.ZodTypeAny>(
  input: RunPhaseAgentInput<TSchema>,
  repairsLeft = MAX_SCHEMA_REPAIRS,
): Effect.Effect<PhaseAgentResult<z.infer<TSchema>>, PhaseAgentError> =>
  Effect.retry(attempt(input), {
    schedule: RESTART_SCHEDULE,
    while: isRetryable,
  }).pipe(
    Effect.catchTag("AgentSchemaError", (error) =>
      repairsLeft > 0
        ? runPhaseAgent(withRepairInstruction(input, error), repairsLeft - 1)
        : Effect.fail(error),
    ),
  );
