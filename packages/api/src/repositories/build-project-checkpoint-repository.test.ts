import { describe, expect, it, vi } from "vitest";

import type { ProjectBuildRunPayload } from "./build-project-checkpoint-repository";
import { buildProjectCheckpointRepository } from "./build-project-checkpoint-repository";

const run: ProjectBuildRunPayload = {
  status: "building",
  input: {
    projectName: "system design",
    targetIdentity: "systems architect",
    summary: "Build an AI research harness.",
    outcomes: [
      {
        title: "Evaluate research systems",
        result: "Produce a defensible evaluation of an AI research system.",
      },
    ],
    startingPoint: {
      tier: "skip_basics",
      reason: "Has built small evaluation scripts.",
    },
    understanding: {
      build: "Build an AI research harness.",
      goodMeans: ["reliable"],
      currentGap: "Evaluation results are hard to trust.",
      evidence: {
        currentBaseline: ["Has built small evaluation scripts."],
        hardMoments: ["Cannot explain inconsistent evaluation results."],
        constraints: [],
      },
    },
  },
  state: {
    phase: "building",
    projectName: "system-design",
    steps: [],
    modules: [],
    moduleCount: 0,
    sessionId: "session-id",
  },
};

const makeDb = (updatedAt: Date) => {
  let payload: ProjectBuildRunPayload = run;
  const checkpoint = {
    id: "checkpoint-id",
    sessionId: "session-id",
    step: "run",
    sourceKey: "source-key",
    payload,
    status: "pending",
    attempts: 0,
    failureKind: null,
    leaseId: "lease-id",
    leaseExpiresAt:
      updatedAt.getTime() < Date.now() - 60_000
        ? new Date(Date.now() - 60_000)
        : new Date(Date.now() + 60_000),
    createdAt: updatedAt,
    updatedAt,
  };
  const returning = vi.fn(() => Promise.resolve([{ ...checkpoint, payload }]));
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((values: { payload: ProjectBuildRunPayload }) => {
    payload = values.payload;
    return { where };
  });
  const update = vi.fn(() => ({ set }));
  const findFirst = vi.fn(() => Promise.resolve(checkpoint));

  return {
    db: {
      query: { TrainingProjectBuildCheckpoint: { findFirst } },
      update,
    } as never,
    update,
  };
};

describe("buildProjectCheckpointRepository", () => {
  it("rejects a stale owner before running a project persistence callback", async () => {
    const runPersistence = vi.fn(() => Promise.resolve("saved"));
    const returning = vi.fn(() => Promise.resolve([]));
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn(
      (callback: (tx: { update: typeof update }) => Promise<unknown>) =>
        callback({ update }),
    );

    await expect(
      buildProjectCheckpointRepository.withRunOwnership({
        db: { transaction } as never,
        sessionId: "session-id",
        ownershipToken: "stale-lease",
        run: runPersistence,
      }),
    ).rejects.toThrow("lease is no longer valid");
    expect(runPersistence).not.toHaveBeenCalled();
  });

  it("turns an unexpected build failure into a retryable error snapshot", async () => {
    const { db } = makeDb(new Date());

    const failed = await buildProjectCheckpointRepository.failRun({
      db,
      sessionId: "session-id",
      error: "provider disconnected",
    });

    expect(failed).toMatchObject({
      status: "error",
      error: "provider disconnected",
      state: { phase: "error", error: "provider disconnected" },
    });
  });

  it("recovers an abandoned building checkpoint when it is read", async () => {
    const { db, update } = makeDb(new Date(Date.now() - 10 * 60_000));

    const recovered = await buildProjectCheckpointRepository.getRun({
      db,
      sessionId: "session-id",
    });

    expect(update).toHaveBeenCalledOnce();
    expect(recovered).toMatchObject({
      status: "error",
      state: { phase: "error" },
    });
  });

  it("leaves a fresh in-flight checkpoint building", async () => {
    const { db, update } = makeDb(new Date());

    const current = await buildProjectCheckpointRepository.getRun({
      db,
      sessionId: "session-id",
    });

    expect(update).not.toHaveBeenCalled();
    expect(current?.status).toBe("building");
  });

  it("reclaims an errored run without inserting a duplicate checkpoint", async () => {
    const existing = {
      id: "checkpoint-id",
      sessionId: "session-id",
      step: "run",
      sourceKey: "old-source-key",
      payload: { ...run, status: "error" as const },
      status: "pending",
      attempts: 0,
      failureKind: null,
      leaseId: null,
      leaseExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const returningInsert = vi.fn(() => Promise.resolve([]));
    const onConflictDoNothing = vi.fn(() => ({ returning: returningInsert }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const returningUpdate = vi.fn(() => Promise.resolve([existing]));
    const where = vi.fn(() => ({ returning: returningUpdate }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const findFirst = vi.fn(() => Promise.resolve(existing));

    const result = await buildProjectCheckpointRepository.claimRun({
      db: {
        insert,
        update,
        query: { TrainingProjectBuildCheckpoint: { findFirst } },
      } as never,
      sessionId: "session-id",
      sourceKey: "new-source-key",
      payload: run,
    });

    expect(onConflictDoNothing).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "claimed" });
  });
});
