import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { sql } from "@acme/db";

import { withSkillKnowledgeBuildLock } from "./skill-knowledge-build-lock";

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

const wait = (ms: number) =>
  new Promise((resolveWait) => setTimeout(resolveWait, ms));

describe("skill knowledge build lock concurrency", () => {
  it.skipIf(!process.env.POSTGRES_URL)(
    "serializes the complete build for one skill",
    async () => {
      const { db } = await import("@acme/db/client");
      const skillNodeId = randomUUID();
      const events: string[] = [];
      const build = (label: string, holdMs: number) =>
        withSkillKnowledgeBuildLock({
          db,
          skillNodeId,
          run: async (lockDb) => {
            events.push(`${label}:start`);
            await wait(holdMs);
            await lockDb.execute(sql`select 1`);
            events.push(`${label}:end`);
          },
        });

      const first = build("first", 300);
      await wait(75);
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
});
