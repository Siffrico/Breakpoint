import { Effect } from "effect";

import type {
  RecordWebVital,
  WorkspaceTurnPerformanceMetric,
} from "@acme/validators";

import { PerformanceRepo } from "../performance-repo";

export const recordWorkspaceTurnPerformanceWorkflow = (
  metric: WorkspaceTurnPerformanceMetric,
) =>
  Effect.gen(function* () {
    const repo = yield* PerformanceRepo;
    yield* repo.recordWorkspaceTurn(metric);
  });

export const recordWebVitalPerformanceWorkflow = (metric: RecordWebVital) =>
  Effect.gen(function* () {
    const repo = yield* PerformanceRepo;
    yield* repo.recordWebVital({
      ...metric,
      release:
        process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
    });
  });
