import assert from "node:assert/strict";
import { test } from "vitest";

import type { ScenarioDirective } from "../engine/rating";
import { createInitialRatingState } from "../engine/rating";
import {
  deriveDefaultBands,
  recordEvaluation,
  resolveScenarioDirective,
} from "./goldilocks";

const progress = {
  bandOrder: 0,
  supportLevel: "worked_example" as const,
};

const jobProgress = () => ({
  ratingState: createInitialRatingState(),
  progress,
  misconceptions: [],
  recentAttempts: [],
  masteredAt: null,
});

void test("resolving difficulty is read-only", async () => {
  const result = await resolveScenarioDirective({
    userId: "user-1",
    nodeId: "cluster-1",
    now: new Date("2026-01-01T00:00:00.000Z"),
    bands: deriveDefaultBands(),
    deps: {
      loadJobProgress: () => Promise.resolve(jobProgress()),
      listRecentPredictions: () => Promise.resolve([]),
    },
  });

  assert.equal(result.learnerRating, createInitialRatingState().rating);
  assert.match(result.promptBlock, /Difficulty directive/);
});

void test("defaults the initial rating state when no seed is supplied", async () => {
  let seenInitial: number | null = null;
  await resolveScenarioDirective({
    userId: "user-1",
    nodeId: "cluster-1",
    now: new Date("2026-01-01T00:00:00.000Z"),
    bands: deriveDefaultBands(),
    deps: {
      loadJobProgress: ({ initialRatingState }) => {
        seenInitial = initialRatingState.rating;
        return Promise.resolve(jobProgress());
      },
      listRecentPredictions: () => Promise.resolve([]),
    },
  });

  assert.equal(seenInitial, createInitialRatingState().rating);
});

void test("passes a supplied seed as the initial rating state", async () => {
  const seed = {
    rating: 1_150,
    ratingDeviation: 250,
    volatility: 0.06,
    lastRatedAt: null,
  };
  let seenInitial: number | null = null;
  await resolveScenarioDirective({
    userId: "user-1",
    nodeId: "cluster-1",
    now: new Date("2026-01-01T00:00:00.000Z"),
    bands: deriveDefaultBands(),
    initialRatingState: seed,
    deps: {
      loadJobProgress: ({ initialRatingState }) => {
        seenInitial = initialRatingState.rating;
        return Promise.resolve({
          ratingState: seed,
          progress,
          misconceptions: [],
          recentAttempts: [],
          masteredAt: null,
        });
      },
      listRecentPredictions: () => Promise.resolve([]),
    },
  });

  assert.equal(seenInitial, 1_150);
});

void test("rating evaluation addresses the exact scenario attempt", async () => {
  const directive: ScenarioDirective = {
    intent: "probe",
    bandOrder: 0,
    supportLevel: "worked_example",
    targetItemRating: 1_000,
    targetMisconceptionCode: null,
    reason: "Probe current performance.",
    nextProgress: progress,
  };
  let savedScenarioAttemptId: string | null = null;

  await recordEvaluation({
    scenarioAttemptId: "scenario-1",
    userId: "user-1",
    nodeId: "cluster-1",
    score: 80,
    errorCodes: [],
    occurredAt: new Date("2026-01-01T00:01:00.000Z"),
    bands: deriveDefaultBands(),
    deps: {
      getScenarioAttempt: ({ scenarioAttemptId }) => {
        assert.equal(scenarioAttemptId, "scenario-1");
        return Promise.resolve({
          id: scenarioAttemptId,
          directiveJson: directive,
          itemRating: directive.targetItemRating,
        });
      },
      loadJobProgress: () => Promise.resolve(jobProgress()),
      saveEvaluationResult: ({ scenarioAttemptId }) => {
        savedScenarioAttemptId = scenarioAttemptId;
        return Promise.resolve();
      },
    },
  });

  assert.equal(savedScenarioAttemptId, "scenario-1");
});
