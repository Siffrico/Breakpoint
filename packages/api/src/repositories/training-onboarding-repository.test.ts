import { describe, expect, it, vi } from "vitest";

import { trainingOnboardingRepository } from "./training-onboarding-repository";

interface FindManyArgs {
  where: unknown;
  orderBy: unknown;
  limit?: number;
}

const createDb = (rows: unknown[]) => {
  const findMany = vi.fn((_args: FindManyArgs) => Promise.resolve(rows));
  const db = {
    query: { TrainingOnboardingSession: { findMany } },
  } as unknown as Parameters<
    typeof trainingOnboardingRepository.getLatestOnboardingSession
  >[0]["db"];
  return { db, findMany };
};

describe("trainingOnboardingRepository.getLatestOnboardingSession", () => {
  it("returns the latest session, including a completed build", async () => {
    const session = { id: "s-1", status: "complete" };
    const { db, findMany } = createDb([session]);

    const result =
      await trainingOnboardingRepository.getLatestOnboardingSession({
        db,
        userId: "user-1",
      });

    expect(result).toBe(session);
    // Latest-first selection lives in SQL; completed rows are deliberately not
    // filtered because the onboarding screen must restore their build card.
    const args = findMany.mock.calls[0]?.[0];
    expect(args?.limit).toBe(1);
    expect(args?.where).toBeDefined();
    expect(args?.orderBy).toBeDefined();
  });

  it("returns null when the user has no onboarding session", async () => {
    const { db } = createDb([]);

    const result =
      await trainingOnboardingRepository.getLatestOnboardingSession({
        db,
        userId: "user-1",
      });

    expect(result).toBeNull();
  });
});

describe("trainingOnboardingRepository.setStartingPoint", () => {
  const createSetDb = (returnedRows: unknown[]) => {
    const returning = vi.fn(() => Promise.resolve(returnedRows));
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
    const update = vi.fn(() => ({ set }));
    const db = { update } as unknown as Parameters<
      typeof trainingOnboardingRepository.setStartingPoint
    >[0]["db"];
    return { db, set, where };
  };

  it("writes both the tier and label columns", async () => {
    const session = { id: "s-1", startingPointTier: "skip_basics" };
    const { db, set } = createSetDb([session]);

    const result = await trainingOnboardingRepository.setStartingPoint({
      db,
      sessionId: "s-1",
      tier: "skip_basics",
      label: "I've deployed models to production",
    });

    expect(result).toBe(session);
    const written = set.mock.calls[0]?.[0];
    expect(written?.startingPointTier).toBe("skip_basics");
    expect(written?.startingPointLabel).toBe(
      "I've deployed models to production",
    );
  });

  it("returns null when no session row matches", async () => {
    const { db } = createSetDb([]);

    const result = await trainingOnboardingRepository.setStartingPoint({
      db,
      sessionId: "missing",
      tier: "fundamentals",
      label: "Starting from zero",
    });

    expect(result).toBeNull();
  });
});

describe("trainingOnboardingRepository.setInitialStartingPoint", () => {
  it("uses a guarded update and returns null when a starting point already exists", async () => {
    const returning = vi.fn(() => Promise.resolve([]));
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const db = { update } as unknown as Parameters<
      typeof trainingOnboardingRepository.setInitialStartingPoint
    >[0]["db"];

    await expect(
      trainingOnboardingRepository.setInitialStartingPoint({
        db,
        sessionId: "s-1",
        tier: "skip_basics",
        label: "I've shipped a production service",
      }),
    ).resolves.toBeNull();

    expect(where).toHaveBeenCalledOnce();
    expect(returning).toHaveBeenCalledOnce();
  });
});

describe("trainingOnboardingRepository.upsertMessageByTurnRole", () => {
  it("updates the canonical message instead of appending another row", async () => {
    const existing = {
      id: "message-id",
      sessionId: "session-id",
      role: "assistant",
      content: "Old build status",
      slot: "project_build_status",
      unitId: null,
      turnId: "onboarding-project-build-status",
      metadata: null,
      sequence: 7,
      createdAt: new Date(),
    };
    const updated = { ...existing, content: "New build status" };
    const findFirst = vi.fn(() => Promise.resolve(existing));
    const returning = vi.fn(() => Promise.resolve([updated]));
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const insert = vi.fn();
    const db = {
      query: { TrainingOnboardingMessage: { findFirst } },
      update,
      insert,
    } as unknown as Parameters<
      typeof trainingOnboardingRepository.upsertMessageByTurnRole
    >[0]["db"];

    const result = await trainingOnboardingRepository.upsertMessageByTurnRole({
      db,
      sessionId: "session-id",
      role: "assistant",
      content: "New build status",
      slot: "project_build_status",
      turnId: "onboarding-project-build-status",
    });

    expect(result).toBe(updated);
    expect(set).toHaveBeenCalledWith({
      content: "New build status",
      slot: "project_build_status",
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("trainingOnboardingRepository.claimWorkspaceTurn", () => {
  const claimInput = {
    sessionId: "00000000-0000-0000-0000-000000000001",
    turnId: "turn-1",
    leaseId: "00000000-0000-0000-0000-000000000099",
    action: "submit_answer" as const,
    content: "A sufficiently complete answer",
    slot: "education_unit",
    unitId: "00000000-0000-0000-0000-000000000002",
  };

  const createClaimDb = (reclaimedRows: { id: string }[]) => {
    const returning = vi.fn(() => Promise.resolve(reclaimedRows));
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
    const update = vi.fn(() => ({ set }));
    const findFirst = vi.fn(() =>
      Promise.resolve({
        id: "00000000-0000-0000-0000-000000000010",
        status: "processing",
      }),
    );
    const db = {
      query: { TrainingWorkspaceTurn: { findFirst } },
      update,
    } as unknown as Parameters<
      typeof trainingOnboardingRepository.claimWorkspaceTurn
    >[0]["db"];

    return { db, set };
  };

  it("does not steal a processing turn when the atomic lease update loses", async () => {
    const { db } = createClaimDb([]);

    await expect(
      trainingOnboardingRepository.claimWorkspaceTurn({ db, ...claimInput }),
    ).resolves.toEqual({ status: "processing" });
  });

  it("returns claimed only when the atomic stale-lease update succeeds", async () => {
    const { db, set } = createClaimDb([
      { id: "00000000-0000-0000-0000-000000000010" },
    ]);

    await expect(
      trainingOnboardingRepository.claimWorkspaceTurn({ db, ...claimInput }),
    ).resolves.toEqual({ status: "claimed" });
    const leaseUpdate = set.mock.calls[0]?.[0];
    expect(leaseUpdate?.leaseId).toBe(claimInput.leaseId);
    expect(leaseUpdate?.leaseExpiresAt).toBeInstanceOf(Date);
  });
});
