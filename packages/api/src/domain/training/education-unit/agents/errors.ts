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

export class AgentProviderError extends Data.TaggedError("AgentProviderError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AgentTimeoutError extends Data.TaggedError("AgentTimeoutError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AgentPartialOutputError extends Data.TaggedError(
  "AgentPartialOutputError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type PhaseAgentError =
  | AgentSchemaError
  | AgentProviderError
  | AgentTimeoutError
  | AgentPartialOutputError;

/** True for the errors Schedule-based retry should attempt again. */
export const isRetryable = (error: PhaseAgentError): boolean =>
  error._tag === "AgentTimeoutError" || error._tag === "AgentProviderError";

const fallbackMessage = "Phase agent call failed.";

/**
 * Classify a thrown value from a phase-agent's model call into the tagged
 * error channel. Phase-agent turns are single structured calls (no
 * continuation-resume like the long-form artifact agents), so a "partial"
 * classification here just means truncated output, not a resumable draft.
 */
export const classifyPhaseAgentFailure = (error: unknown): PhaseAgentError => {
  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage;
  const kind = classifyFailure(error, false);

  switch (kind) {
    case "schema":
      return new AgentSchemaError({ message, cause: error });
    case "timeout":
      return new AgentTimeoutError({ message, cause: error });
    case "partial":
      return new AgentPartialOutputError({ message, cause: error });
    case "provider":
    case "save":
      return new AgentProviderError({ message, cause: error });
  }
};
