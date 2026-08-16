import type { Effect } from "effect";
import { Context } from "effect";

import type {
  RecordWebVital,
  WorkspaceTurnPerformanceMetric,
} from "@acme/validators";

import type { DbError } from "../../effect/errors";

export interface WebVitalPerformanceInput extends RecordWebVital {
  release: string | null;
}

export interface PerformanceRepoShape {
  recordWorkspaceTurn: (
    metric: WorkspaceTurnPerformanceMetric,
  ) => Effect.Effect<void, DbError>;
  recordWebVital: (
    metric: WebVitalPerformanceInput,
  ) => Effect.Effect<void, DbError>;
}

export class PerformanceRepo extends Context.Service<
  PerformanceRepo,
  PerformanceRepoShape
>()("api/PerformanceRepo") {}
