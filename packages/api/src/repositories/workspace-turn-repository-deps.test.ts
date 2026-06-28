import { describe, expect, it, vi } from "vitest";

import type { WorkspaceEducationTurnCommit } from "../domain/training/workspace-ai/workspace-turn-persistence";
import { createWorkspaceTurnRepositoryDeps } from "./workspace-turn-repository-deps";

describe("workspace turn lease fencing", () => {
  it("rejects a stale worker before committing turn side effects", async () => {
    const returning = vi.fn(() => Promise.resolve([]));
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ update }),
    );
    const db = { transaction } as unknown as Parameters<
      typeof createWorkspaceTurnRepositoryDeps
    >[0];
    const deps = createWorkspaceTurnRepositoryDeps(db);
    const commit = {
      turnId: "turn-1",
      turnLeaseId: "00000000-0000-0000-0000-000000000099",
      userMessage: null,
      assistantMessage: {
        sessionId: "00000000-0000-0000-0000-000000000001",
        role: "assistant",
        content: "Feedback",
        slot: "education_unit",
        unitId: "00000000-0000-0000-0000-000000000002",
        turnId: "turn-1",
      },
      contracts: null,
      phaseResponse: {
        unitContentId: "00000000-0000-0000-0000-000000000003",
        sessionId: "00000000-0000-0000-0000-000000000001",
        phase: "ai_education",
        userResponse: "Answer",
      },
      ratingEvaluation: null,
      nextRun: {
        sessionId: "00000000-0000-0000-0000-000000000001",
        unitContentId: "00000000-0000-0000-0000-000000000003",
        userId: "user-1",
        workflowId: "verdict-rulebook-v1",
        currentStepId: "Review",
        stepScenarioCount: 0,
      },
      completion: null,
      touchSessionId: "00000000-0000-0000-0000-000000000001",
    } satisfies WorkspaceEducationTurnCommit;

    await expect(deps.commitEducationTurn(commit)).rejects.toThrow(
      "Workspace turn lease is no longer valid.",
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
});
