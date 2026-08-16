/*
 * Integration test: the lock protocol's guarantees (singleflight, waiter
 * wake-up, and — critically — that a saturated pool of waiters cannot starve
 * the builder) depend on real lease rows and pooled connections, so mocks
 * cannot prove them.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { db as databaseClient } from "@acme/db/client";
import { and, eq, sql } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingNodeBuild,
  TrainingOnboardingSession,
  TrainingUnitContent,
} from "@acme/db/schema";

import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { awaitUnitBuildSettled, withUnitBuildLock } from "./unit-build-lock";

type Database = typeof databaseClient;

const loadPostgresUrlFromDotenv = () => {
  if (process.env.POSTGRES_URL) return;

  const envPath = resolve(process.cwd(), "../../.env");
  if (!existsSync(envPath)) return;

  const match = /^POSTGRES_URL=(.+)$/m.exec(readFileSync(envPath, "utf8"));
  if (match?.[1]) {
    process.env.POSTGRES_URL = match[1].trim().replace(/^"|"$/g, "");
  }
};

loadPostgresUrlFromDotenv();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const withUnitNode = async <T>(
  db: Database,
  run: (nodeId: string) => Promise<T>,
) => {
  const [session] = await db
    .insert(TrainingOnboardingSession)
    .values({ userId: null })
    .returning();
  if (!session) throw new Error("Expected lock-test session.");
  try {
    const [plan] = await db
      .insert(TrainingCurriculumPlan)
      .values({
        onboardingSessionId: session.id,
        title: "Lock test",
        summary: "Lock lifecycle integration test.",
        targetIdentity: "Tester",
      })
      .returning();
    if (!plan) throw new Error("Expected lock-test plan.");
    const [node] = await db
      .insert(TrainingCurriculumNode)
      .values({
        planId: plan.id,
        kind: "unit",
        status: "ready",
        title: "Lock test unit",
        summary: "Exercise node build ownership.",
        whyItMatters: "Concurrency must be deterministic.",
        orderIndex: 0,
        depth: 1,
        positionColumn: 0,
        positionRow: 0,
      })
      .returning();
    if (!node) throw new Error("Expected lock-test node.");
    return await run(node.id);
  } finally {
    await db
      .delete(TrainingOnboardingSession)
      .where(eq(TrainingOnboardingSession.id, session.id));
  }
};

describe("unit build lock concurrency", () => {
  it.skipIf(!process.env.POSTGRES_URL)(
    "rejects stale-owner unit content inserts and replacements",
    async () => {
      const { db } = await import("@acme/db/client");
      for (const operation of ["insert", "replace"] as const) {
        await withUnitNode(db, async (nodeId) => {
          const contentInput = {
            nodeId,
            title: "Stale content",
            buildContent: "Stale teaching content",
            seedPrompt: "Stale prompt",
            seedHint: "Stale hint",
            clusterArcFrame: "Stale frame",
            complexityBudget: 3 as const,
            teachbackSetup: {
              studentPersona: "Stale learner",
              openingMisconception: "Stale misconception",
              roundLadder: [
                {
                  round: 1,
                  objection: "Stale objection",
                  objective: "Stale objective",
                },
              ],
              passSignals: ["Stale signal"],
              failureModes: ["Stale failure"],
            },
            scenario: {
              title: "Stale scenario",
              focusAreas: ["stale"],
            },
          };
          if (operation === "replace") {
            await db.insert(TrainingUnitContent).values({
              nodeId,
              title: "Current owner content",
              seedPrompt: "Current prompt",
              seedHint: "Current hint",
              clusterArcFrame: "Current frame",
              complexityBudget: 1,
              teachbackSetup: {
                studentPersona: "Current learner",
                openingMisconception: "Current misconception",
              },
              scenarioTitle: "Current scenario",
              scenarioFocusAreas: ["current"],
            });
          }

          const newerLeaseId = "00000000-0000-0000-0000-000000000099";
          await expect(
            withUnitBuildLock({
              db,
              nodeId,
              build: async (lockDb, withLease) => {
                await lockDb
                  .update(TrainingNodeBuild)
                  .set({
                    leaseId: newerLeaseId,
                    leaseExpiresAt: new Date(Date.now() + 60_000),
                  })
                  .where(
                    and(
                      eq(TrainingNodeBuild.kind, "unit_content"),
                      eq(TrainingNodeBuild.nodeId, nodeId),
                    ),
                  );

                return withLease(async (leaseDb) => {
                  if (operation === "insert") {
                    await trainingCurriculumRepository.createUnitContentIfAbsent(
                      { db: leaseDb, ...contentInput },
                    );
                  } else {
                    await trainingCurriculumRepository.replaceUnitContent({
                      db: leaseDb,
                      ...contentInput,
                      title: "Stale replacement",
                    });
                  }
                  return "stale result";
                });
              },
              loadReady: () => Promise.resolve("ready"),
            }),
          ).rejects.toMatchObject({ _tag: "NodeBuildLeaseLostError" });

          const content = await db.query.TrainingUnitContent.findFirst({
            where: eq(TrainingUnitContent.nodeId, nodeId),
          });
          if (operation === "insert") {
            expect(content).toBeUndefined();
          } else {
            expect(content?.title).toBe("Current owner content");
          }
        });
      }
    },
    20_000,
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "rejects a stale owner without changing the newer lease",
    async () => {
      const { db } = await import("@acme/db/client");
      for (const outcome of ["success", "failure"] as const) {
        await withUnitNode(db, async (nodeId) => {
          const newerLeaseId = "00000000-0000-0000-0000-000000000099";
          await expect(
            withUnitBuildLock({
              db,
              nodeId,
              build: async (lockDb) => {
                await lockDb
                  .update(TrainingNodeBuild)
                  .set({
                    leaseId: newerLeaseId,
                    leaseExpiresAt: new Date(Date.now() + 60_000),
                  })
                  .where(
                    and(
                      eq(TrainingNodeBuild.kind, "unit_content"),
                      eq(TrainingNodeBuild.nodeId, nodeId),
                    ),
                  );
                if (outcome === "failure") throw new Error("build failed");
                return "stale result";
              },
              loadReady: () => Promise.resolve("ready"),
            }),
          ).rejects.toMatchObject({ _tag: "NodeBuildLeaseLostError" });

          const build = await db.query.TrainingNodeBuild.findFirst({
            where: and(
              eq(TrainingNodeBuild.kind, "unit_content"),
              eq(TrainingNodeBuild.nodeId, nodeId),
            ),
          });
          expect(build).toMatchObject({
            status: "running",
            leaseId: newerLeaseId,
            failureCode: null,
            failureMessage: null,
          });
        });
      }
    },
    20_000,
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "builds once and makes concurrent callers load the ready result",
    async () => {
      const { db } = await import("@acme/db/client");
      await withUnitNode(db, async (nodeId) => {
        const events: string[] = [];

        const build = (label: string, holdMs: number) =>
          withUnitBuildLock({
            db,
            nodeId,
            build: async (lockDb) => {
              events.push(`${label}:start`);
              await wait(holdMs);
              await lockDb.execute(sql`select 1`);
              events.push(`${label}:end`);
              return "built" as const;
            },
            loadReady: async (readyDb) => {
              await readyDb.execute(sql`select 1`);
              events.push(`${label}:load`);
              return "ready" as const;
            },
          });

        const first = build("first", 400);
        await wait(100);
        const second = build("second", 0);
        await expect(Promise.all([first, second])).resolves.toEqual([
          "built",
          "ready",
        ]);

        expect(events).toEqual(["first:start", "first:end", "second:load"]);

        await expect(build("third", 0)).resolves.toBe("ready");
        expect(events.at(-1)).toBe("third:load");
      });
    },
    20_000,
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "completes a build while waiters saturate the pool",
    async () => {
      const { db } = await import("@acme/db/client");
      await withUnitNode(db, async (nodeId) => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));

        const build = withUnitBuildLock({
          db,
          nodeId,
          build: async (lockDb) => {
            await gate;
            // The post-lock queries must succeed even though every other pool
            // connection is being contended by waiters — the old protocol
            // deadlocked exactly here.
            await lockDb.execute(sql`select 1`);
            return "built" as const;
          },
          loadReady: () => Promise.resolve("ready" as const),
        });
        // Let the builder reach the gate before waiters pile on.
        await wait(200);

        // More waiters than the whole pool (default max is 5). Under the old
        // parked-transaction protocol these held every connection until their
        // timeout, starving the builder above.
        const waiters = Promise.all(
          Array.from({ length: 6 }, () =>
            awaitUnitBuildSettled({ db, nodeId, timeoutMs: 8_000 }),
          ),
        );
        await wait(500);
        release();

        const built = await build;
        expect(built).toBe("built");
        // With the lock released at commit, every waiter settles true well
        // before its deadline.
        expect(await waiters).toEqual([true, true, true, true, true, true]);
      });
    },
    20_000,
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "reports not-settled while a build is in flight, without parking",
    async () => {
      const { db } = await import("@acme/db/client");
      await withUnitNode(db, async (nodeId) => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let markEntered!: () => void;
        const entered = new Promise<void>((resolveEntered) => {
          markEntered = resolveEntered;
        });

        const build = withUnitBuildLock({
          db,
          nodeId,
          build: () => {
            markEntered();
            return gate.then(() => "built" as const);
          },
          loadReady: () => Promise.resolve("ready" as const),
        });
        await entered;

        const startedAt = Date.now();
        const settled = await awaitUnitBuildSettled({
          db,
          nodeId,
          timeoutMs: 1_000,
        });
        expect(settled).toBe(false);
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_000);

        release();
        await expect(build).resolves.toBe("built");

        await expect(
          awaitUnitBuildSettled({ db, nodeId, timeoutMs: 1_000 }),
        ).resolves.toBe(true);
      });
    },
    20_000,
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "executes the heartbeat while a slow build is in flight",
    async () => {
      const { db } = await import("@acme/db/client");
      await withUnitNode(db, async (nodeId) => {
        let release!: () => void;
        const gate = new Promise<void>(
          (resolveGate) => (release = resolveGate),
        );
        let markEntered!: () => void;
        const entered = new Promise<void>((resolveEntered) => {
          markEntered = resolveEntered;
        });

        const build = withUnitBuildLock({
          db,
          nodeId,
          build: () => {
            markEntered();
            return gate.then(() => "built" as const);
          },
          loadReady: () => Promise.resolve("ready" as const),
        });
        await entered;
        const before = await db.query.TrainingNodeBuild.findFirst({
          where: and(
            eq(TrainingNodeBuild.kind, "unit_content"),
            eq(TrainingNodeBuild.nodeId, nodeId),
          ),
        });
        if (!before?.leaseExpiresAt)
          throw new Error("Expected an active lease.");

        await wait(20_500);

        const after = await db.query.TrainingNodeBuild.findFirst({
          where: and(
            eq(TrainingNodeBuild.kind, "unit_content"),
            eq(TrainingNodeBuild.nodeId, nodeId),
          ),
        });
        expect(after?.leaseExpiresAt?.getTime()).toBeGreaterThan(
          before.leaseExpiresAt.getTime(),
        );

        release();
        await expect(build).resolves.toBe("built");
      });
    },
    30_000,
  );
});
