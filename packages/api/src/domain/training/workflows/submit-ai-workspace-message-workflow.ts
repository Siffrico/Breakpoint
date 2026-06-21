import type { Result } from "../../../lib/result";
import type {
  AttemptTiming,
  WorkspaceAiTurnResult,
} from "../workspace-ai/types";
import type { WorkspaceTurnOrchestrationDependencies } from "../workspace-ai/workspace-turn-orchestration";
import { err, ok } from "../../../lib/result";
import { runWorkspaceAiPrompt } from "../workspace-ai/runtime";
import {
  completeWorkspaceTurn,
  prepareWorkspaceTurnPrompt,
} from "../workspace-ai/workspace-turn-orchestration";

/**
 * Takes one user workspace message; produces the persisted AI response and next
 * workspace state; fails only when the session has no curriculum, no runnable
 * turn, invalid unit state, or the AI cannot produce schema-valid output.
 */
export const submitAiWorkspaceMessageWorkflow = async ({
  sessionId,
  userId,
  message,
  attemptTiming,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  attemptTiming?: AttemptTiming | null;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Promise<Result<WorkspaceAiTurnResult>> => {
  let prepared: Awaited<ReturnType<typeof prepareWorkspaceTurnPrompt>>;
  try {
    prepared = await prepareWorkspaceTurnPrompt({
      sessionId,
      userId,
      message,
      attemptTiming,
      action: "submit_answer",
      deps,
    });
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Workspace turn failed.",
    );
  }

  try {
    const output = await runWorkspaceAiPrompt({
      kind: prepared.runtime.promptKind,
      schema: prepared.runtime.outputSchema,
      errorMessage:
        prepared.turn.state.mode === "recall"
          ? "Failed to run recall."
          : "Failed to run education unit.",
      context: prepared.promptContext,
    });
    const result = await completeWorkspaceTurn({
      prepared,
      rawOutput: output,
      deps,
    });

    if (!result) {
      return err("Workspace turn did not produce a persisted result.");
    }

    return ok(result);
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Workspace turn failed.",
    );
  }
};
