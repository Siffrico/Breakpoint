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
        kind: "skill",
        status: "ready",
        title: "Knowledge lock skill",
        summary: "Exercise knowledge build ownership.",
        whyItMatters: "Knowledge generation must be single-flight.",
        skillMap: {
          workflow: { name: "Test", steps: ["Read", "Run", "Verify"] },
          bandRamp: { startRating: 850, peakRating: 1450 },
          masteryContract: { exitCriteria: ["Verifies ownership"] },
          scenarioArchetype: "judge",
        },
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
    "serializes the complete build for one skill",
    async () => {
      const { db } = await import("@acme/db/client");
      await withSkillNode(db, async (skillNodeId) => {
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

        const firstStart = events.indexOf("first:start");
        const secondStart = events.indexOf("second:start");

        expect(events).toEqual(
          expect.arrayContaining([
            "first:start",
            "first:end",
            "second:start",
            "second:end",
          ]),
        );
        expect(events[firstStart + 1]).toBe("first:end");
        expect(events[secondStart + 1]).toBe("second:end");
      });
    },
    20_000,
  );
});
