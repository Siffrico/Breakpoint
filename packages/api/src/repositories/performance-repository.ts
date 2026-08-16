import { Effect, Layer } from "effect";

import { WebVitalPerformance, WorkspaceTurnPerformance } from "@acme/db/schema";

import { PerformanceRepo } from "../domain/performance/performance-repo";
import { Db, queryWithClient } from "../effect/db";

export const PerformanceRepoLive = Layer.effect(
  PerformanceRepo,
  Effect.gen(function* () {
    const { client } = yield* Db;

    return {
      recordWorkspaceTurn: (metric) =>
        queryWithClient(
          client,
          "insertWorkspaceTurnPerformance",
          async (db) => {
            await db.insert(WorkspaceTurnPerformance).values(metric);
          },
        ),
      recordWebVital: (metric) =>
        queryWithClient(client, "insertWebVitalPerformance", async (db) => {
          await db.insert(WebVitalPerformance).values(metric);
        }),
    };
  }),
);
