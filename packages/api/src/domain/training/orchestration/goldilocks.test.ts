import assert from "node:assert/strict";
import { test } from "vitest";

import type { ScenarioDirective } from "../engine/rating";
import type { ResolveScenarioDirectiveDependencies } from "./goldilocks";
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

const scenarioFormat = {
  id: "judge",
  label: "Judgment",
  kind: "frq" as const,
  description: "Evaluate an artifact and justify the decision.",
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
    scenarioFormat,
    deps: {
      loadJobProgress: () => Promise.resolve(jobProgress()),
      listRecentPredictions: () => Promise.resolve([]),
    },
  });

  assert.equal(result.learnerRating, createInitialRatingState().rating);
  assert.match(result.promptBlock, /Difficulty directive/);
  assert.equal(result.format.id, "judge");
  assert.deepEqual(result.dialPreset, {
    steps: [1, 1],
    withheldGivens: [0, 0],
    alternatives: [0, 0],
  });
  assert.doesNotMatch(result.promptBlock, /Target item rating/);
});

void test("uses the curriculum's declared scenario format", async () => {
  const loaded = {
    ...jobProgress(),
    recentAttempts: [
      {
        bandOrder: 0,
        offeredSupport: "worked_example" as const,
        itemRating: 900,
        outcome: 0.5,
        effectiveSupport: "worked_example" as const,
        cleanPass: false,
        pass: false,
        hardFail: false,
        occurredAt: new Date(),
      },
    ],
  };
  const result = await resolveScenarioDirective({
    userId: "user-1",
    nodeId: "cluster-1",
    now: new Date("2026-01-01T00:00:00Z"),
    bands: deriveDefaultBands(),
    scenarioFormat,
    deps: {
      loadJobProgress: () => Promise.resolve(loaded),
      listRecentPredictions: () => Promise.resolve([]),
    },
  });
  assert.equal(result.format.id, "judge");
});

void test("defaults the initial rating state when no seed is supplied", async () => {
  let seenInitial: number | null = null;
  await resolveScenarioDirective({
    userId: "user-1",
    nodeId: "cluster-1",
    now: new Date("2026-01-01T00:00:00.000Z"),
    bands: deriveDefaultBands(),
    scenarioFormat,
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
    scenarioFormat,
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
    checksMet: 4,
    checksTotal: 5,
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

void test("evaluation and repeated resolution apply only one back-off per new attempt", async () => {
  const now = new Date("2026-01-01T00:01:00.000Z");
  let loaded: Awaited<
    ReturnType<ResolveScenarioDirectiveDependencies["loadJobProgress"]>
  > = {
    ...jobProgress(),
    ratingState: {
      ...createInitialRatingState(),
      rating: 1200,
      ratingDeviation: 80,
    },
    progress: { bandOrder: 1, supportLevel: "guided" },
  };
  let directive: ScenarioDirective = {
    intent: "challenge",
    bandOrder: 1,
    supportLevel: "guided",
    targetItemRating: 1100,
    targetMisconceptionCode: null,
    reason: "Practice with guidance.",
    nextProgress: loaded.progress,
  };
  const resolve = () =>
    resolveScenarioDirective({
      userId: "user-1",
      nodeId: "cluster-1",
      now,
      bands: deriveDefaultBands(),
      scenarioFormat,
      deps: {
        loadJobProgress: () => Promise.resolve(loaded),
        listRecentPredictions: () => Promise.resolve([]),
      },
    });
  const fail = () =>
    recordEvaluation({
      scenarioAttemptId: "scenario-1",
      userId: "user-1",
      nodeId: "cluster-1",
      checksMet: 0,
      checksTotal: 1,
      errorCodes: [],
      occurredAt: now,
      bands: deriveDefaultBands(),
      deps: {
        getScenarioAttempt: () =>
          Promise.resolve({
            id: "scenario-1",
            directiveJson: directive,
            itemRating: directive.targetItemRating,
          }),
        loadJobProgress: () => Promise.resolve(loaded),
        saveEvaluationResult: ({ result, nextProgress, masteredAt }) => {
          loaded = {
            ratingState: result.ratingState,
            progress: nextProgress,
            misconceptions: result.misconceptions,
            recentAttempts: [...loaded.recentAttempts, result.attempt],
            masteredAt,
          };
          return Promise.resolve();
        },
      },
    });

  await fail();
  directive = (await resolve()).directive;
  assert.equal(directive.supportLevel, "guided");
  await fail();
  const next = (await resolve()).directive;
  assert.equal(next.intent, "back_off");
  assert.equal(next.bandOrder, 1);
  assert.equal(next.supportLevel, "worked_example");
  assert.deepEqual((await resolve()).directive, next);

  directive = next;
  await fail();
  const afterFullSupport = (await resolve()).directive;
  assert.equal(afterFullSupport.intent, "back_off");
  assert.equal(afterFullSupport.bandOrder, 0);
  assert.equal(afterFullSupport.supportLevel, "guided");
  assert.deepEqual((await resolve()).directive, afterFullSupport);
});
