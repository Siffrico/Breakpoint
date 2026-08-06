import type { z } from "zod/v4";
import { APICallError, NoObjectGeneratedError } from "ai";

import type { AgentId } from "../engine/agent-config";
import { getAgentConfig } from "../engine/agent-config";
import { invokeStructuredModel } from "../engine/invoke-structured-model";
import {
  getSearchToolsForStructuredOutput,
  requireStructuredAiModelForPurpose,
} from "../engine/model-router";
import { getRunProfile } from "../engine/run-profiles";

type ArtifactAgentId = Extract<
  AgentId,
  "curriculumDesigner" | "knowledgeMapper" | "buildContent" | "projectOverview"
>;

export const runAgent = async <TSchema extends z.ZodTypeAny>({
  agent,
  system,
  prompt,
  schema,
  errorMessage,
}: {
  agent: ArtifactAgentId;
  system: string;
  prompt: string;
  schema: TSchema;
  errorMessage: string;
}): Promise<z.infer<TSchema>> => {
  const purpose = getAgentConfig(agent).purpose;
  const profile = getRunProfile(purpose);
  const model = requireStructuredAiModelForPurpose(
    purpose,
    "AI-generated training workflows",
  );

  try {
    const result = invokeStructuredModel({
      model,
      schema,
      schemaName: `${agent}_output`,
      system,
      prompt,
      tools: getSearchToolsForStructuredOutput(purpose),
      maxSteps: profile.maxSteps,
      profile,
    });
    const object = await result.output;

    return object as z.infer<TSchema>;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `${errorMessage} ${error.message}`
        : errorMessage,
      { cause: error },
    );
  }
};

/**
 * The discrete ways an artifact's AI generation (or its persistence) can fail.
 * The orchestrator maps each kind to a retry policy so a failure is recovered
 * with the cheapest move that can work, never a blanket full re-run:
 *   - timeout / provider → restart  (same input, the call just didn't land)
 *   - schema             → repair   (one fixer pass over the invalid output)
 *   - partial            → continue (seed the captured partial, ask to finish)
 *   - save               → save_only (AI already succeeded; re-persist, 0 tokens)
 */
export type ArtifactFailureKind =
  | "timeout"
  | "provider"
  | "schema"
  | "partial"
  | "save";

/** Typed error carrying the failure kind + the last captured partial output. */
export class ArtifactBuildError extends Error {
  readonly failureKind: ArtifactFailureKind;
  readonly partial?: unknown;

  constructor(
    message: string,
    failureKind: ArtifactFailureKind,
    partial?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ArtifactBuildError";
    this.failureKind = failureKind;
    this.partial = partial;
  }
}

export const isArtifactBuildError = (
  error: unknown,
): error is ArtifactBuildError => error instanceof ArtifactBuildError;

/**
 * Map an arbitrary thrown value to an {@link ArtifactFailureKind}. `hasPartial`
 * lets us distinguish a truncated generation (we captured streamed content)
 * from a model that produced nothing parseable.
 */
export const classifyFailure = (
  error: unknown,
  hasPartial: boolean,
): ArtifactFailureKind => {
  if (isArtifactBuildError(error)) {
    return error.failureKind;
  }

  // The model emitted text but it never resolved into a schema-valid object.
  // A streamed partial is a truncation only when the caller has a continuation
  // strategy. Raw invalid text is a schema failure a repair pass can fix.
  if (NoObjectGeneratedError.isInstance(error)) {
    return hasPartial ? "partial" : "schema";
  }

  // Model returned JSON that violated the Zod schema.
  if (
    error instanceof Error &&
    (error.name === "AI_TypeValidationError" ||
      error.name === "TypeValidationError")
  ) {
    return "schema";
  }

  // Transport-level failures: rate limits, server errors and timeouts are
  // transient (restart); a hard 4xx is a provider problem (also restartable,
  // but flagged distinctly for observability).
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    if (status === 429 || status === 408 || status >= 500) {
      return "timeout";
    }
    return "provider";
  }

  if (error instanceof Error && error.cause !== undefined) {
    return classifyFailure(error.cause, hasPartial);
  }

  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "timeout";
  }

  return "provider";
};

const MAX_RESTARTS = 2;
const MAX_CONTINUATIONS = 2;
const MAX_REPAIRS = 1;
/** Throttle for mid-stream partial flushes so we don't write the DB per token. */
const PARTIAL_FLUSH_MS = 4000;

/**
 * Describes how an agent recovers a *truncated* generation. Only agents whose
 * output has a long-form, append-able field (e.g. the overview's markdown body)
 * supply this; structured agents omit it and fall back to a restart.
 */
export interface ContinuationConfig<T> {
  /** Build a prompt that seeds the captured partial and asks to finish it. */
  buildPrompt: (basePrompt: string, partial: Partial<T>) => string;
  /** Merge the streamed partial (pre-failure) with the final object. */
  merge?: (partial: Partial<T>, output: T) => T;
}

/** Resume plumbing an agent forwards from the orchestrator to the runner. */
export interface ArtifactResumeOptions<T> {
  /** Throttled, fire-and-forget partial sink for mid-stream checkpointing. */
  onPartial?: (partial: Partial<T>) => void;
  /** Resume seed: a partial persisted from an earlier crashed attempt. */
  seedPartial?: Partial<T>;
  /** Hard deadline for this agent's model calls, including its retries. */
  abortSignal?: AbortSignal;
}

const hasContent = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === "object") return Object.values(value).some(hasContent);
  return Boolean(value);
};

const errorText = (prefix: string, error: unknown): string =>
  error instanceof Error && error.message
    ? `${prefix} ${error.message}`
    : prefix;

/** Walk the cause chain for the NoObjectGeneratedError carrying the raw text. */
const rawModelText = (error: unknown, depth = 0): string => {
  if (depth > 5 || error == null) return "";
  if (
    NoObjectGeneratedError.isInstance(error) &&
    typeof error.text === "string"
  ) {
    return error.text.trim();
  }
  return error instanceof Error ? rawModelText(error.cause, depth + 1) : "";
};

const buildRepairPrompt = (basePrompt: string, error: unknown): string => {
  const raw = rawModelText(error);
  return `${basePrompt}

The previous attempt did not return an object matching the required schema. Return exactly one complete JSON object that strictly matches the schema, with no commentary.${
    raw ? `\n\nPrevious raw output to correct:\n${raw.slice(0, 6000)}` : ""
  }`;
};

/**
 * Run a build artifact's agent with failure-kind-aware recovery in one place:
 * it streams the object output (capturing partials so a crash mid-generation is
 * resumable), and on failure applies repair / continue / restart per
 * {@link classifyFailure}. On exhaustion it throws an {@link ArtifactBuildError}
 * carrying the final kind and the last partial so the orchestrator can record
 * it for a later resume. Use {@link runAgent} for non-build agents.
 */
export const runResilientAgent = async <TSchema extends z.ZodTypeAny>({
  agent,
  system,
  prompt,
  schema,
  errorMessage,
  continuation,
  onPartial,
  seedPartial,
  abortSignal,
}: {
  agent: ArtifactAgentId;
  system: string;
  prompt: string;
  schema: TSchema;
  errorMessage: string;
  continuation?: ContinuationConfig<z.infer<TSchema>>;
  /** Throttled, fire-and-forget partial sink for mid-stream checkpointing. */
  onPartial?: (partial: Partial<z.infer<TSchema>>) => void;
  /** Resume seed: a partial persisted from an earlier crashed attempt. */
  seedPartial?: Partial<z.infer<TSchema>>;
  /**
   * Caller's hard deadline. Every recovery branch below re-checks it: a spent
   * budget must end the agent, not start another attempt it cannot finish.
   */
  abortSignal?: AbortSignal;
}): Promise<z.infer<TSchema>> => {
  type T = z.infer<TSchema>;
  const purpose = getAgentConfig(agent).purpose;
  const profile = getRunProfile(purpose);
  const model = requireStructuredAiModelForPurpose(
    purpose,
    "AI-generated training workflows",
  );
  const basePrompt = prompt;

  const seeded = Boolean(
    seedPartial && continuation && hasContent(seedPartial),
  );
  let partial: Partial<T> = seeded && seedPartial ? { ...seedPartial } : {};
  let activePrompt =
    seeded && continuation
      ? continuation.buildPrompt(basePrompt, partial)
      : basePrompt;
  let restarts = 0;
  let continuations = seeded ? 1 : 0;
  let repairs = 0;
  let lastFlush = 0;

  while (true) {
    try {
      const result = invokeStructuredModel({
        model,
        schema,
        schemaName: `${agent}_output`,
        system,
        prompt: activePrompt,
        tools: getSearchToolsForStructuredOutput(purpose),
        maxSteps: profile.maxSteps,
        profile,
        abortSignal,
      });

      for await (const next of result.partialOutputStream) {
        partial = next as Partial<T>;
        const now = Date.now();
        if (onPartial && now - lastFlush >= PARTIAL_FLUSH_MS) {
          lastFlush = now;
          onPartial(partial);
        }
      }

      const output = (await result.output) as T;
      return continuation?.merge ? continuation.merge(partial, output) : output;
    } catch (error) {
      const partialPresent = hasContent(partial);
      const kind = classifyFailure(error, partialPresent);
      const message = errorText(errorMessage, error);

      // Budget spent. Every branch below starts another model call, so none of
      // them can run — surface the partial so the caller can checkpoint it.
      if (abortSignal?.aborted) {
        throw new ArtifactBuildError(message, "timeout", partial, {
          cause: error,
        });
      }

      if (kind === "schema") {
        // Surface what the model actually emitted — without this, a parse
        // failure is undiagnosable (the raw text is otherwise dropped).
        console.error(`[agent-runtime] ${agent} schema failure`, {
          repairs,
          rawTextPreview: rawModelText(error).slice(0, 1500) || undefined,
        });
      }

      if (kind === "schema" && repairs < MAX_REPAIRS) {
        repairs += 1;
        activePrompt = buildRepairPrompt(basePrompt, error);
        continue;
      }

      if (
        kind === "partial" &&
        continuation &&
        partialPresent &&
        continuations < MAX_CONTINUATIONS
      ) {
        continuations += 1;
        activePrompt = continuation.buildPrompt(basePrompt, partial);
        continue;
      }

      if (kind === "partial" && restarts < MAX_RESTARTS) {
        restarts += 1;
        partial = {};
        activePrompt = basePrompt;
        continue;
      }

      if (
        (kind === "timeout" || kind === "provider") &&
        restarts < MAX_RESTARTS
      ) {
        restarts += 1;
        activePrompt = basePrompt;
        continue;
      }

      throw new ArtifactBuildError(
        message,
        kind,
        partialPresent ? partial : undefined,
        { cause: error },
      );
    }
  }
};
