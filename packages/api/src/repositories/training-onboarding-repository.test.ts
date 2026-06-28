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
    typeof trainingOnboardingRepository.getLatestResumableSession
  >[0]["db"];
  return { db, findMany };
};

describe("trainingOnboardingRepository.getLatestResumableSession", () => {
  it("returns the latest resumable session and asks the DB for a single row", async () => {
    const session = { id: "s-1", status: "questioning" };
    const { db, findMany } = createDb([session]);

    const result = await trainingOnboardingRepository.getLatestResumableSession(
      {
        db,
        userId: "user-1",
      },
    );

    expect(result).toBe(session);
    // The "skip complete" + "latest first" filtering lives in the SQL query,
    // so assert the wrapper requests exactly one row with a where/orderBy.
    const args = findMany.mock.calls[0]?.[0];
    expect(args?.limit).toBe(1);
    expect(args?.where).toBeDefined();
    expect(args?.orderBy).toBeDefined();
  });

  it("returns null when the user has no resumable session", async () => {
    const { db } = createDb([]);

    const result = await trainingOnboardingRepository.getLatestResumableSession(
      {
        db,
        userId: "user-1",
      },
    );

    expect(result).toBeNull();
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
