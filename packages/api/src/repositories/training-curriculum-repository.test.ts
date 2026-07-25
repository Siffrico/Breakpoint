import { describe, expect, it } from "vitest";

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
