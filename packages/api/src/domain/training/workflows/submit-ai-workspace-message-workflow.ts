import type { Result } from "../../../lib/result";
import type {
  AttemptTiming,
  WorkspaceAiTurnResult,
} from "../workspace-ai/types";
import type { WorkspaceTurnOrchestrationDependencies } from "../workspace-ai/workspace-turn-orchestration";
import { err, ok } from "../../../lib/result";
import { runOneStep } from "../workspace-ai/workspace-turn-orchestration";

/**
 * Takes one user workspace message; produces the persisted AI response and next
 * workspace state; fails only when the session has no curriculum, no runnable
 * turn, invalid unit state, or the AI cannot produce schema-valid output.
 */
export const submitAiWorkspaceMessageWorkflow = async ({
  sessionId,
  userId,
  message,
  turnId = null,
  attemptTiming,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  turnId?: string | null;
  attemptTiming?: AttemptTiming | null;
  deps: WorkspaceTurnOrchestrationDependencies;
}): Promise<Result<WorkspaceAiTurnResult>> => {
  try {
    return ok(
      await runOneStep({
        sessionId,
        userId,
        turnId,
        message,
        attemptTiming,
        action: "submit_answer",
        deps,
      }),
    );
  } catch (error) {
    if (turnId && deps.markWorkspaceTurnFailed) {
      await deps.markWorkspaceTurnFailed({
        sessionId,
        turnId,
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
    return err(
      error instanceof Error ? error.message : "Workspace turn failed.",
    );
  }
};
