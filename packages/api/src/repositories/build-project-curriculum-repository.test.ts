import { describe, expect, it, vi } from "vitest";

import { buildProjectCurriculumRepository } from "./build-project-curriculum-repository";

describe("buildProjectCurriculumRepository.upsertPlanShell", () => {
  it("refreshes an existing shell when its seed changed", async () => {
    const existingSeed = {
      rating: 950,
      ratingDeviation: 250,
      volatility: 0.06,
    };
    const nextSeed = { ...existingSeed, rating: 1350 };
    const plan = { id: "plan-1", seedRating: existingSeed };
    const onConflictDoNothing = vi.fn(() => Promise.resolve());
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const where = vi.fn(() => Promise.resolve());
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const db = {
      insert,
      update,
      query: {
        TrainingCurriculumPlan: {
          findFirst: vi.fn(() => Promise.resolve(plan)),
        },
      },
    } as unknown as Parameters<
      typeof buildProjectCurriculumRepository.upsertPlanShell
    >[0]["db"];

    const result = await buildProjectCurriculumRepository.upsertPlanShell({
      db,
      sessionId: "session-1",
      userId: "user-1",
      title: "systems programming",
      summary: "Build a runtime",
      targetIdentity: "systems programmer",
      curriculumMode: "ability",
      seedRating: nextSeed,
    });

    expect(set).toHaveBeenCalledWith({ seedRating: nextSeed });
    expect(result.seedRating).toEqual(nextSeed);
  });

  it("does not rewrite an existing shell when its seed is unchanged", async () => {
    const seedRating = {
      rating: 1150,
      ratingDeviation: 250,
      volatility: 0.06,
    };
    const plan = { id: "plan-1", seedRating };
    const onConflictDoNothing = vi.fn(() => Promise.resolve());
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const update = vi.fn();
    const db = {
      insert,
      update,
      query: {
        TrainingCurriculumPlan: {
          findFirst: vi.fn(() => Promise.resolve(plan)),
        },
      },
    } as unknown as Parameters<
      typeof buildProjectCurriculumRepository.upsertPlanShell
    >[0]["db"];

    await buildProjectCurriculumRepository.upsertPlanShell({
      db,
      sessionId: "session-1",
      title: "machine learning",
      summary: "Ship a model",
      targetIdentity: "ML engineer",
      curriculumMode: "ability",
      seedRating,
    });

    expect(update).not.toHaveBeenCalled();
  });
});
