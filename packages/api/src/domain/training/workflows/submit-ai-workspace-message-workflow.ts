import { randomUUID } from "node:crypto";

import type { Result } from "../../../lib/result";
import type {
  AttemptTiming,
  WorkspaceAiTurnResult,
} from "../workspace-ai/types";
import type { WorkspaceTurnOrchestrationDependencies } from "../workspace-ai/workspace-turn-orchestration";
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
  // Optionality ends at the transport boundary. Every internal turn is leased
  // and idempotent, including clients that have not adopted turn IDs yet.
  const normalizedTurnId = turnId ?? randomUUID();
  const turnLeaseId = randomUUID();
  try {
    return ok(
      await runOneStep({
        sessionId,
        userId,
        turnId: normalizedTurnId,
        turnLeaseId,
        message,
        attemptTiming,
        action: "submit_answer",
        deps,
      }),
    );
  } catch (error) {
    if (deps.markWorkspaceTurnFailed) {
      await deps.markWorkspaceTurnFailed({
        sessionId,
        turnId: normalizedTurnId,
        leaseId: turnLeaseId,
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
    if (error instanceof UnitNotReadyError) {
      throw error;
    }
    return err(
      error instanceof Error ? error.message : "Workspace turn failed.",
    );
  }
};
