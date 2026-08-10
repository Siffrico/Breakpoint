import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { db as databaseClient } from "@acme/db/client";
import { eq, sql } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingOnboardingSession,
} from "@acme/db/schema";

import { withSkillKnowledgeBuildLock } from "./skill-knowledge-build-lock";

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

const wait = (ms: number) =>
  new Promise((resolveWait) => setTimeout(resolveWait, ms));

const withSkillNode = async <T>(
  db: Database,
  run: (nodeId: string) => Promise<T>,
) => {
  const [session] = await db
    .insert(TrainingOnboardingSession)
    .values({ userId: null })
    .returning();
  if (!session) throw new Error("Expected knowledge-lock test session.");
  try {
    const [plan] = await db
      .insert(TrainingCurriculumPlan)
      .values({
        onboardingSessionId: session.id,
        title: "Knowledge lock test",
        summary: "Knowledge lifecycle integration test.",
        targetIdentity: "Tester",
      })
      .returning();
    if (!plan) throw new Error("Expected knowledge-lock test plan.");
    const [node] = await db
      .insert(TrainingCurriculumNode)
      .values({
        planId: plan.id,
        kind: "outcome",
        status: "ready",
        title: "Knowledge lock skill",
        summary: "Exercise knowledge build ownership.",
        whyItMatters: "Knowledge generation must be single-flight.",
        outcomeResult: "Verify build ownership.",
        skillMap: null,
        practiceContract: null,
        orderIndex: 0,
        depth: 1,
        positionColumn: 0,
        positionRow: 0,
      })
      .returning();
    if (!node) throw new Error("Expected knowledge-lock test node.");
    return await run(node.id);
  } finally {
    await db
      .delete(TrainingOnboardingSession)
      .where(eq(TrainingOnboardingSession.id, session.id));
  }
};

describe("skill knowledge build lock concurrency", () => {
  it.skipIf(!process.env.POSTGRES_URL)(
    "builds once and makes concurrent callers load ready knowledge",
    async () => {
      const { db } = await import("@acme/db/client");
      await withSkillNode(db, async (skillNodeId) => {
        const events: string[] = [];
        const build = (label: string, holdMs: number) =>
          withSkillKnowledgeBuildLock({
            db,
            skillNodeId,
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

        const first = build("first", 300);
        await wait(75);
        const second = build("second", 0);
        await expect(Promise.all([first, second])).resolves.toEqual([
          "built",
          "ready",
        ]);
        expect(events).toEqual(["first:start", "first:end", "second:load"]);
      });
    },
    20_000,
  );
});
