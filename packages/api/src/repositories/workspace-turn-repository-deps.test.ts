import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceEducationTurnCommit } from "../domain/training/workspace-ai/workspace-turn-persistence";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../domain/training/education-unit/experience";
import { createUnitRun } from "../domain/training/education-unit/unit-state";
import { WorkspaceTurnRepo } from "../domain/training/workspace-ai/workspace-turn-repo";
import {
  createWorkspaceTurnRepositoryDeps,
  workspaceTurnRepoLayer,
} from "./workspace-turn-repository-deps";

const freshRun = createUnitRun({
  unitId: "00000000-0000-0000-0000-000000000003",
  sessionId: "00000000-0000-0000-0000-000000000001",
  userId: "user-1",
  kind: "education",
  experience: DEFAULT_EDUCATION_EXPERIENCE,
  masteryContract: {
    version: 1,
    dimensions: [
      {
        id: "make-decision",
        name: "Make the decision",
        description: "Make and defend the target decision.",
        passSignals: ["Defends the decision"],
        failSignals: ["Guesses without evidence"],
        surrogateTraps: ["Uses vocabulary without reasoning"],
      },
    ],
  },
});

describe("workspace unit lease acquisition", () => {
  it("materializes a missing projected run while claiming its lease", async () => {
    const returning = vi.fn(() => Promise.resolve([{ id: "unit-run" }]));
    const onConflictDoUpdate = vi.fn(
      (_input: {
        target: unknown[];
        set: Record<string, unknown>;
        setWhere: unknown;
      }) => ({ returning }),
    );
    const values = vi.fn((_input: Record<string, unknown>) => ({
      onConflictDoUpdate,
    }));
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as Parameters<
      typeof createWorkspaceTurnRepositoryDeps
    >[0];

    const claimed = await createWorkspaceTurnRepositoryDeps(
      db,
    ).claimWorkspaceUnitLease({
      sessionId: freshRun.sessionId,
      unitContentId: freshRun.unitId,
      leaseId: "00000000-0000-0000-0000-000000000099",
      run: freshRun,
    });

    expect(claimed).toBe(true);
    const inserted = values.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      sessionId: freshRun.sessionId,
      unitContentId: freshRun.unitId,
      kind: freshRun.kind,
      mode: freshRun.mode,
      experienceId: freshRun.experience.id,
      experienceVersion: freshRun.experience.version,
      experienceJson: freshRun.experience,
      masteryContractJson: freshRun.masteryContract,
      capabilityTodosJson: freshRun.todos,
      turnLeaseId: "00000000-0000-0000-0000-000000000099",
    });
    expect(inserted?.turnLeaseExpiresAt).toBeInstanceOf(Date);

    const conflict = onConflictDoUpdate.mock.calls[0]?.[0];
    expect(conflict?.target).toHaveLength(3);
    expect(conflict?.set).toMatchObject({
      turnLeaseId: "00000000-0000-0000-0000-000000000099",
    });
    expect(conflict?.set.turnLeaseExpiresAt).toBeInstanceOf(Date);
    expect(conflict?.setWhere).toBeDefined();
  });

  it("reports contention when the atomic claim returns no row", async () => {
    const returning = vi.fn(() => Promise.resolve([]));
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as Parameters<
      typeof createWorkspaceTurnRepositoryDeps
    >[0];

    const claimed = await createWorkspaceTurnRepositoryDeps(
      db,
    ).claimWorkspaceUnitLease({
      sessionId: freshRun.sessionId,
      unitContentId: freshRun.unitId,
      leaseId: "00000000-0000-0000-0000-000000000098",
      run: freshRun,
    });

    expect(claimed).toBe(false);
  });
});

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
      phaseResponse: {
        unitContentId: "00000000-0000-0000-0000-000000000003",
        sessionId: "00000000-0000-0000-0000-000000000001",
        phase: "ai_education",
        userResponse: "Answer",
      },
      ratingEvaluation: null,
      knowledgeCheckOff: null,
      scenarioPresentation: null,
      solvePresentation: null,
      nextRun: freshRun,
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
      phaseResponse: {
        unitContentId: "00000000-0000-0000-0000-000000000003",
        sessionId: "00000000-0000-0000-0000-000000000001",
        phase: "ai_education",
        userResponse: "Answer",
      },
      ratingEvaluation: null,
      knowledgeCheckOff: null,
      scenarioPresentation: null,
      solvePresentation: null,
      nextRun: freshRun,
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
