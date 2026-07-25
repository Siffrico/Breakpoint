export interface PromptExecution {
  promptId: string;
  version: number;
  tier: string;
  model: string;
  latencyMs: number;
  attempt: number;
  inputTokens?: number;
  outputTokens?: number;
  scoreEmitted?: number;
  success: boolean;
  error?: string;
}

/**
 * Logs a prompt execution for observability.
 *
 * Currently logs to structured console output.
 * Designed to be swapped for a persistent store (DB, analytics service)
 * without changing the call sites.
 */
export const logPromptExecution = (execution: PromptExecution): void => {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.PROMPT_OBSERVABILITY === "true"
  ) {
    const tag = execution.success ? "PROMPT_OK" : "PROMPT_FAIL";
    const parts = [
      `[${tag}]`,
      `id=${execution.promptId}@v${execution.version}`,
      `tier=${execution.tier}`,
      `attempt=${execution.attempt}`,
      `latency=${execution.latencyMs}ms`,
    ];
    if (execution.scoreEmitted !== undefined) {
      parts.push(`score=${execution.scoreEmitted}`);
    }
    if (execution.error) {
      parts.push(`error=${execution.error}`);
    }

    console.log(parts.join(" "));
  }
};
