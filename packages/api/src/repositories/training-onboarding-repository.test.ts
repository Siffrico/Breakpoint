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

    const result = await trainingOnboardingRepository.getLatestResumableSession({
      db,
      userId: "user-1",
    });

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

    const result = await trainingOnboardingRepository.getLatestResumableSession({
      db,
      userId: "user-1",
    });

    expect(result).toBeNull();
  });
});
