import { describe, expect, it, vi } from "vitest";

import { trainingCurriculumRepository } from "./training-curriculum-repository";

const createDbWithOverviewGeneratedAt = (
  overviewGeneratedAt: Date | string | null,
) =>
  ({
    query: {
      TrainingCurriculumPlan: {
        findFirst: () =>
          Promise.resolve({
            overview: {
              title: "Overview",
              summary: "Summary",
              body: "Body",
            },
            overviewGeneratedAt,
          }),
      },
    },
  }) as unknown as Parameters<
    typeof trainingCurriculumRepository.getProjectOverview
  >[0]["db"];

describe("trainingCurriculumRepository", () => {
  it("keeps a generating plan out of learner-facing active reads", async () => {
    const findProfile = vi.fn(() => Promise.resolve({ id: "profile-1" }));
    const db = {
      query: {
        TrainingCurriculumPlan: {
          findFirst: () =>
            Promise.resolve({
              id: "plan-1",
              status: "generating",
              profileVersionId: "profile-1",
              title: "Draft plan",
              summary: "Draft summary",
              targetIdentity: "Expert",
              overview: null,
              overviewGeneratedAt: null,
            }),
        },
        TrainingIdentityProfileVersion: { findFirst: findProfile },
        TrainingCurriculumNode: { findMany: () => Promise.resolve([]) },
      },
    } as unknown as Parameters<
      typeof trainingCurriculumRepository.getActivePlan
    >[0]["db"];

    await expect(
      trainingCurriculumRepository.getActivePlan({
        db,
        sessionId: "session-1",
      }),
    ).resolves.toBeNull();
    expect(findProfile).not.toHaveBeenCalled();

    await expect(
      trainingCurriculumRepository.getBuildPlan({
        db,
        sessionId: "session-1",
      }),
    ).resolves.toMatchObject({ id: "plan-1", title: "Draft plan" });
  });

  it("serializes overview timestamps returned as Dates", async () => {
    const overview = await trainingCurriculumRepository.getProjectOverview({
      db: createDbWithOverviewGeneratedAt(new Date("2026-06-23T12:00:00.000Z")),
      sessionId: "00000000-0000-0000-0000-000000000000",
    });

    expect(overview?.generatedAt).toBe("2026-06-23T12:00:00.000Z");
  });

  it("serializes overview timestamps returned as strings", async () => {
    const overview = await trainingCurriculumRepository.getProjectOverview({
      db: createDbWithOverviewGeneratedAt("2026-06-23T12:00:00.000Z"),
      sessionId: "00000000-0000-0000-0000-000000000000",
    });

    expect(overview?.generatedAt).toBe("2026-06-23T12:00:00.000Z");
  });
});
