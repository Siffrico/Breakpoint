import { AsyncLocalStorage } from "node:async_hooks";

import type {
  WorkspaceModelAttemptMetric,
  WorkspaceTurnPerformanceMetric,
} from "@acme/validators";

interface ModelAttemptStart {
  agent: "mentor" | "reviewer";
  purpose: string;
  schemaName: string;
  provider: string;
  model: string;
}

interface ModelAttemptFinish {
  outcome: "success" | "error";
  errorTag?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
}

export interface WorkspaceModelAttemptTimer {
  markFirstChunk: () => void;
  markFirstVisible: () => void;
  finish: (result: ModelAttemptFinish) => void;
}

export interface WorkspaceTurnPerformanceTimer {
  markPlanLoaded: () => void;
  markTurnReady: (educationStage: string | null) => void;
  markFirstVisible: () => void;
  markCommitted: () => void;
  startModelAttempt: (input: ModelAttemptStart) => WorkspaceModelAttemptTimer;
  finish: (input: {
    outcome: "success" | "error" | "aborted";
    errorTag?: string | null;
  }) => WorkspaceTurnPerformanceMetric;
}

const timerStore = new AsyncLocalStorage<WorkspaceTurnPerformanceTimer>();

const elapsed = (later: number | null, earlier: number | null) =>
  later === null || earlier === null ? null : Math.max(0, later - earlier);

export const getErrorTag = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string"
  ) {
    return error._tag.slice(0, 96);
  }
  return error instanceof Error ? error.name.slice(0, 96) : "UnknownError";
};

export const createWorkspaceTurnPerformanceTimer = ({
  sessionId,
  turnId,
  action,
  requestStartedAt,
  now = Date.now,
}: {
  sessionId: string;
  turnId: string;
  action: string;
  requestStartedAt: number;
  now?: () => number;
}): WorkspaceTurnPerformanceTimer => {
  const streamStartedAt = now();
  let planLoadedAt: number | null = null;
  let turnReadyAt: number | null = null;
  let educationStage: string | null = null;
  let firstVisibleAt: number | null = null;
  let committedAt: number | null = null;
  let modelStartedAt: number | null = null;
  let modelFinishedAt: number | null = null;
  let firstModelChunkAt: number | null = null;
  const modelAttempts: WorkspaceModelAttemptMetric[] = [];

  return {
    markPlanLoaded: () => {
      planLoadedAt ??= now();
    },
    markTurnReady: (stage) => {
      educationStage = stage;
      turnReadyAt ??= now();
    },
    markFirstVisible: () => {
      firstVisibleAt ??= now();
    },
    markCommitted: () => {
      committedAt ??= now();
    },
    startModelAttempt: (input) => {
      const startedAt = now();
      modelStartedAt ??= startedAt;
      let firstChunkAt: number | null = null;
      let attemptFirstVisibleAt: number | null = null;
      let finished = false;

      return {
        markFirstChunk: () => {
          const timestamp = now();
          firstChunkAt ??= timestamp;
          firstModelChunkAt ??= timestamp;
        },
        markFirstVisible: () => {
          attemptFirstVisibleAt ??= now();
        },
        finish: (result) => {
          if (finished) return;
          finished = true;
          const finishedAt = now();
          modelFinishedAt = finishedAt;
          modelAttempts.push({
            ...input,
            durationMs: Math.max(0, finishedAt - startedAt),
            firstChunkMs: elapsed(firstChunkAt, startedAt),
            firstVisibleMs: elapsed(attemptFirstVisibleAt, startedAt),
            inputTokens: result.inputTokens ?? null,
            cachedInputTokens: result.cachedInputTokens ?? null,
            outcome: result.outcome,
            errorTag: result.errorTag ?? null,
          });
        },
      };
    },
    finish: ({ outcome, errorTag }) => {
      const finishedAt = now();
      return {
        sessionId,
        turnId,
        action,
        educationStage,
        outcome,
        errorTag: errorTag ?? null,
        release:
          process.env.VERCEL_GIT_COMMIT_SHA ??
          process.env.GIT_COMMIT_SHA ??
          null,
        timings: {
          requestToStreamMs: Math.max(0, streamStartedAt - requestStartedAt),
          streamToPlanMs: elapsed(planLoadedAt, streamStartedAt),
          planToTurnReadyMs: elapsed(turnReadyAt, planLoadedAt),
          turnReadyToModelMs: elapsed(modelStartedAt, turnReadyAt),
          modelToFirstChunkMs: elapsed(firstModelChunkAt, modelStartedAt),
          modelToFirstVisibleMs: elapsed(firstVisibleAt, modelStartedAt),
          modelWindowMs: elapsed(modelFinishedAt, modelStartedAt),
          modelAttemptsMs: modelAttempts.reduce(
            (total, attempt) => total + attempt.durationMs,
            0,
          ),
          modelDoneToCommitMs: elapsed(committedAt, modelFinishedAt),
          totalMs: Math.max(0, finishedAt - requestStartedAt),
        },
        modelAttempts: [...modelAttempts],
      };
    },
  };
};

export const withWorkspaceTurnPerformanceTimer = <T>(
  timer: WorkspaceTurnPerformanceTimer,
  run: () => Promise<T>,
): Promise<T> => timerStore.run(timer, run);

export const getWorkspaceTurnPerformanceTimer = () => timerStore.getStore();
