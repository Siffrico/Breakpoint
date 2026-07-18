import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceEducationTurnCommit } from "../domain/training/workspace-ai/workspace-turn-persistence";
import { WorkspaceTurnRepo } from "../domain/training/workspace-ai/workspace-turn-repo";
import { workspaceTurnRepoLayer } from "./workspace-turn-repository-deps";

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
      typeof workspaceTurnRepoLayer
    >[0];
    const commit = {
      turnId: "turn-1",
      turnLeaseId: "00000000-0000-0000-0000-000000000099",
      unitLeaseId: "00000000-0000-0000-0000-000000000099",
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
      syllabusCheckOff: null,
      scenarioPresentation: null,
      solvePresentation: null,
      nextRun: {
        unitId: "00000000-0000-0000-0000-000000000003",
        sessionId: "00000000-0000-0000-0000-000000000001",
        userId: "user-1",
        recipeVersion: "education-unit-v1",
        phase: "solve",
        pass: 1,
        connectGrills: 0,
        solveRepairs: 0,
        scenarioSpec: null,
        difficultySnapshot: null,
      },
      completion: null,
      touchSessionId: "00000000-0000-0000-0000-000000000001",
    } satisfies WorkspaceEducationTurnCommit;

    const program = Effect.gen(function* () {
      const repo = yield* WorkspaceTurnRepo;
      return yield* repo.commitEducationTurn(commit);
    }).pipe(Effect.provide(workspaceTurnRepoLayer(db)));

    await expect(Effect.runPromise(program)).rejects.toMatchObject({
      _tag: "DbError",
      operation: "commitEducationTurn",
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale unit worker before committing turn side effects", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: "workspace-turn-row" }])
      .mockResolvedValueOnce([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ update }),
    );
    const db = { transaction } as unknown as Parameters<
      typeof workspaceTurnRepoLayer
    >[0];
    const commit = {
      turnId: "turn-1",
      turnLeaseId: "00000000-0000-0000-0000-000000000099",
      unitLeaseId: "00000000-0000-0000-0000-000000000099",
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
      syllabusCheckOff: null,
      scenarioPresentation: null,
      solvePresentation: null,
      nextRun: {
        unitId: "00000000-0000-0000-0000-000000000003",
        sessionId: "00000000-0000-0000-0000-000000000001",
        userId: "user-1",
        recipeVersion: "education-unit-v1",
        phase: "solve",
        pass: 1,
        connectGrills: 0,
        solveRepairs: 0,
        scenarioSpec: null,
        difficultySnapshot: null,
      },
      completion: null,
      touchSessionId: "00000000-0000-0000-0000-000000000001",
    } satisfies WorkspaceEducationTurnCommit;

    const program = Effect.gen(function* () {
      const repo = yield* WorkspaceTurnRepo;
      return yield* repo.commitEducationTurn(commit);
    }).pipe(Effect.provide(workspaceTurnRepoLayer(db)));

    await expect(Effect.runPromise(program)).rejects.toMatchObject({
      _tag: "DbError",
      operation: "commitEducationTurn",
    });
    expect(update).toHaveBeenCalledTimes(2);
  });
});
