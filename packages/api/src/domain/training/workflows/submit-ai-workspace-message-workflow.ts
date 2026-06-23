import type { Result } from "../../../lib/result";
import type {
  AttemptTiming,
  WorkspaceAiTurnResult,
} from "../workspace-ai/types";
import type { WorkspaceTurnOrchestrationDependencies } from "../workspace-ai/workspace-turn-orchestration";
import { err, ok } from "../../../lib/result";
import { runWorkspaceAiPrompt } from "../workspace-ai/runtime";
import { planNextWorkspaceTurn } from "../workspace-ai/workspace-turn";
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
  let prepared: Awaited<ReturnType<typeof prepareWorkspaceTurnPrompt>>;
  try {
    prepared = await prepareWorkspaceTurnPrompt({
      sessionId,
      userId,
      turnId,
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

  if (prepared.kind === "cached") {
    const plan = await deps.getActivePlan(sessionId);
    const state = plan
      ? await planNextWorkspaceTurn({ sessionId, plan, deps })
      : null;
    if (!state) {
      return err("Cached workspace turn could not be replayed.");
    }

    return ok({
      state,
      messages: prepared.messages,
      assistantMessage: prepared.assistantMessage,
    });
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
