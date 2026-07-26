import { APICallError } from "ai";
import { Data } from "effect";

import { classifyFailure } from "../../orchestration/agent-runtime";

/**
 * Typed failure channel for a single phase-agent model call. Mirrors the
 * ArtifactFailureKind taxonomy in orchestration/agent-runtime.ts (this reuses
 * classifyFailure rather than re-deriving the classification) so the two
 * retry systems in this codebase don't drift into different definitions of
 * "retryable."
 */
export class AgentSchemaError extends Data.TaggedError("AgentSchemaError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AgentTransientProviderError extends Data.TaggedError(
  "AgentTransientProviderError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AgentProviderRejectedError extends Data.TaggedError(
  "AgentProviderRejectedError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AgentTimeoutError extends Data.TaggedError("AgentTimeoutError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AgentFirstVisibleTimeoutError extends Data.TaggedError(
  "AgentFirstVisibleTimeoutError",
)<{
  readonly message: string;
}> {}

export type PhaseAgentError =
  | AgentSchemaError
  | AgentTransientProviderError
  | AgentProviderRejectedError
  | AgentTimeoutError
  | AgentFirstVisibleTimeoutError;

/** True for the errors Schedule-based retry should attempt again. */
export const isRetryable = (error: PhaseAgentError): boolean =>
  error._tag === "AgentTimeoutError" ||
  error._tag === "AgentTransientProviderError";

const fallbackMessage = "Phase agent call failed.";

/**
 * Classify a thrown value from a phase-agent's model call into the tagged
 * error channel. Phase-agent turns are single structured calls (no
 * continuation-resume like the long-form artifact agents), so a "partial"
 * classification here just means truncated output, not a resumable draft.
 */
export const classifyPhaseAgentFailure = (error: unknown): PhaseAgentError => {
  if (error instanceof AgentFirstVisibleTimeoutError) return error;

  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage;
  const kind = classifyFailure(error, false);

  switch (kind) {
    case "schema":
      return new AgentSchemaError({ message, cause: error });
    case "timeout":
      return new AgentTimeoutError({ message, cause: error });
    case "partial":
      return new AgentSchemaError({ message, cause: error });
    case "provider":
    case "save":
      return APICallError.isInstance(error) &&
        (error.statusCode === undefined ||
          error.statusCode === 429 ||
          error.statusCode >= 500)
        ? new AgentTransientProviderError({ message, cause: error })
        : new AgentProviderRejectedError({ message, cause: error });
  }
};
