import { randomUUID } from "node:crypto";
import type { Layer } from "effect";

import type { Result } from "../../../lib/result";
import type { WorkspaceAiTurnResult } from "../workspace-ai/types";
import type { WorkspaceTurnOrchestrationDependencies } from "../workspace-ai/workspace-turn-orchestration";
import type { WorkspaceTurnRepo } from "../workspace-ai/workspace-turn-repo";
import { err, ok } from "../../../lib/result";
import { UnitNotReadyError } from "../unit-preparation/errors";
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
  turnId,
  deps,
  workspaceTurnRepoLayer,
}: {
  sessionId: string;
  userId: string;
  message: string;
  turnId: string;
  deps: WorkspaceTurnOrchestrationDependencies;
  workspaceTurnRepoLayer: Layer.Layer<WorkspaceTurnRepo>;
}): Promise<Result<WorkspaceAiTurnResult, Error | string>> => {
  const turnLeaseId = randomUUID();
  try {
    return ok(
      await runOneStep({
        sessionId,
        userId,
        turnId,
        turnLeaseId,
        message,
        deps,
        workspaceTurnRepoLayer,
      }),
    );
  } catch (error) {
    await deps.markWorkspaceTurnFailed({
      sessionId,
      turnId,
      leaseId: turnLeaseId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
    if (error instanceof UnitNotReadyError) {
      throw error;
    }
    return err(error instanceof Error ? error : "Workspace turn failed.");
  }
};
