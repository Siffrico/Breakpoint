/*
 * Integration test: the lock protocol's guarantees (singleflight, waiter
 * wake-up, and — critically — that a saturated pool of waiters cannot starve
 * the builder) belong to Postgres advisory locks and real pooled
 * connections, so mocks cannot prove them.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { sql } from "@acme/db";

import { awaitUnitBuildSettled, withUnitBuildLock } from "./unit-build-lock";

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

describe("unit build lock concurrency", () => {
  it.skipIf(!process.env.POSTGRES_URL)(
    "serializes concurrent builds for the same node",
    async () => {
      const { db } = await import("@acme/db/client");
      const nodeId = randomUUID();
      const events: string[] = [];

      const build = (label: string, holdMs: number) =>
        withUnitBuildLock({
          db,
          nodeId,
          run: async (lockDb) => {
            events.push(`${label}:start`);
            await wait(holdMs);
            await lockDb.execute(sql`select 1`);
            events.push(`${label}:end`);
          },
        });

      const first = build("first", 400);
      await wait(100);
      const second = build("second", 0);
      await Promise.all([first, second]);

      expect(events).toEqual([
        "first:start",
        "first:end",
        "second:start",
        "second:end",
      ]);
    },
    20_000,
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "completes a build while waiters saturate the pool",
    async () => {
      const { db } = await import("@acme/db/client");
      const nodeId = randomUUID();

      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));

      const build = withUnitBuildLock({
        db,
        nodeId,
        run: async (lockDb) => {
          await gate;
          // The post-lock queries must succeed even though every other pool
          // connection is being contended by waiters — the old protocol
          // deadlocked exactly here.
          await lockDb.execute(sql`select 1`);
          return "built" as const;
        },
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
    },
    20_000,
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "reports not-settled while a build is in flight, without parking",
    async () => {
      const { db } = await import("@acme/db/client");
      const nodeId = randomUUID();

      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));

      const build = withUnitBuildLock({
        db,
        nodeId,
        run: () => gate.then(() => "built" as const),
      });
      await wait(200);

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
    },
    20_000,
  );
});
