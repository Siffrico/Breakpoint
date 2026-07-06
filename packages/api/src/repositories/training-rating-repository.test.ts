import { describe, expect, it, vi } from "vitest";

import { TrainingScenarioAttempt } from "@acme/db/schema";

import { trainingRatingRepository } from "./training-rating-repository";

const directive = {
  intent: "probe" as const,
  bandOrder: 0,
  supportLevel: "guided" as const,
  targetItemRating: 1100,
  targetMisconceptionCode: null,
  reason: "Calibrated probe",
  nextProgress: { bandOrder: 0, supportLevel: "guided" as const },
};

describe("education scenario attempt identity", () => {
  it("uses the run and presentation turn as the conflict key", async () => {
    const attempt = {
      id: "attempt-1",
      unitRunId: "run-1",
      originTurnId: "turn-1",
    };
    const returning = vi.fn(() => Promise.resolve([attempt]));
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as Parameters<
      typeof trainingRatingRepository.openEducationScenarioAttempt
    >[0]["db"];

    const result = await trainingRatingRepository.openEducationScenarioAttempt({
      db,
      unitRunId: "run-1",
      originTurnId: "turn-1",
      userId: "user-1",
      nodeId: "node-1",
      directive,
      itemRating: 1100,
      scenarioPrompt: "Solve this scenario.",
      presentedAt: new Date("2026-07-05T00:00:00Z"),
    });

    expect(result).toBe(attempt);
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [
        TrainingScenarioAttempt.unitRunId,
        TrainingScenarioAttempt.originTurnId,
      ],
    });
  });
});
