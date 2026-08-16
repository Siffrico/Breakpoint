import { describe, expect, it } from "vitest";

import {
  createWorkspaceTurnPerformanceTimer,
  getWorkspaceTurnPerformanceTimer,
  withWorkspaceTurnPerformanceTimer,
} from "./workspace-turn-timing";

describe("workspace turn performance timing", () => {
  it("separates request, preparation, model and commit time", () => {
    let clock = 100;
    const timer = createWorkspaceTurnPerformanceTimer({
      sessionId: "session-1",
      turnId: "turn-1",
      action: "submit_answer",
      requestStartedAt: 90,
      now: () => clock,
    });

    clock = 120;
    timer.markPlanLoaded();
    clock = 150;
    timer.markTurnReady("review");
    clock = 160;
    const attempt = timer.startModelAttempt({
      agent: "reviewer",
      purpose: "evaluation",
      schemaName: "unit_review_grade",
      provider: "openai",
      model: "gpt-test",
    });
    clock = 170;
    attempt.markFirstChunk();
    clock = 180;
    attempt.markFirstVisible();
    clock = 181;
    timer.markFirstVisible();
    clock = 200;
    attempt.finish({
      outcome: "success",
      inputTokens: 500,
      cachedInputTokens: 300,
    });
    clock = 210;
    timer.markCommitted();
    clock = 220;

    const metric = timer.finish({ outcome: "success" });

    expect(metric.educationStage).toBe("review");
    expect(metric.timings).toEqual({
      requestToStreamMs: 10,
      streamToPlanMs: 20,
      planToTurnReadyMs: 30,
      turnReadyToModelMs: 10,
      modelToFirstChunkMs: 10,
      modelToFirstVisibleMs: 21,
      modelWindowMs: 40,
      modelAttemptsMs: 40,
      modelDoneToCommitMs: 10,
      totalMs: 130,
    });
    expect(metric.modelAttempts).toEqual([
      expect.objectContaining({
        durationMs: 40,
        firstChunkMs: 10,
        firstVisibleMs: 20,
        inputTokens: 500,
        cachedInputTokens: 300,
        outcome: "success",
      }),
    ]);
  });

  it("keeps concurrent request timers isolated", async () => {
    const first = createWorkspaceTurnPerformanceTimer({
      sessionId: "session-1",
      turnId: "turn-1",
      action: "start_unit",
      requestStartedAt: 0,
      now: () => 1,
    });
    const second = createWorkspaceTurnPerformanceTimer({
      sessionId: "session-2",
      turnId: "turn-2",
      action: "start_unit",
      requestStartedAt: 0,
      now: () => 1,
    });

    await Promise.all([
      withWorkspaceTurnPerformanceTimer(first, async () => {
        await Promise.resolve();
        expect(getWorkspaceTurnPerformanceTimer()).toBe(first);
      }),
      withWorkspaceTurnPerformanceTimer(second, async () => {
        await Promise.resolve();
        expect(getWorkspaceTurnPerformanceTimer()).toBe(second);
      }),
    ]);
  });
});
