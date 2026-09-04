import { Effect } from "effect";

import type {
  RecordWebVital,
  WorkspaceTurnPerformanceMetric,
} from "@acme/validators";

import type { DatabaseClient } from "./effect/db";
import {
  recordWebVitalPerformanceWorkflow,
  recordWorkspaceTurnPerformanceWorkflow,
} from "./domain/performance/workflows/record-performance";
import { performanceLayer } from "./effect/runtime";
import { runEffect } from "./router/run-effect";

export const recordWorkspaceTurnPerformance = (
  db: DatabaseClient,
  metric: WorkspaceTurnPerformanceMetric,
): Promise<void> =>
  runEffect(
    recordWorkspaceTurnPerformanceWorkflow(metric).pipe(
      Effect.provide(performanceLayer(db)),
    ),
  );

export const recordWebVitalPerformance = (
  db: DatabaseClient,
  metric: RecordWebVital,
): Promise<void> =>
  runEffect(
    recordWebVitalPerformanceWorkflow(metric).pipe(
      Effect.provide(performanceLayer(db)),
    ),
  );

export const recordWorkspaceTurnPerformanceBestEffort = async (
  db: DatabaseClient,
  metric: WorkspaceTurnPerformanceMetric,
): Promise<void> => {
  await runEffect(
    recordWorkspaceTurnPerformanceWorkflow(metric).pipe(
      Effect.provide(performanceLayer(db)),
      Effect.tapError((error) =>
        Effect.logWarning("Workspace performance metric was not saved.", {
          operation: error.operation,
          kind: error.kind,
          turnId: metric.turnId,
        }),
      ),
      Effect.ignore,
    ),
  );
};
