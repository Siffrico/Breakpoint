/*
 * Integration test: the canonical-winner guarantee belongs to Postgres conflict
 * handling, so a mocked persistence callback cannot prove it.
 */
/* eslint-disable no-restricted-imports */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { eq } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingOnboardingSession,
  TrainingUnitContent,
} from "@acme/db/schema";

import { trainingCurriculumRepository } from "./training-curriculum-repository";

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

const createdSessionIds: string[] = [];

describe("trainingCurriculumRepository conflict handling", () => {
  afterEach(async () => {
    if (!process.env.POSTGRES_URL || createdSessionIds.length === 0) return;

    const { db } = await import("@acme/db/client");
    for (const sessionId of createdSessionIds.splice(0)) {
      await db
        .delete(TrainingOnboardingSession)
        .where(eq(TrainingOnboardingSession.id, sessionId));
    }
  });

  it.skipIf(!process.env.POSTGRES_URL)(
    "returns the same canonical row to concurrent create-if-absent callers",
    async () => {
      const { db } = await import("@acme/db/client");
      const [session] = await db
        .insert(TrainingOnboardingSession)
        .values({ status: "ready_for_generation" })
        .returning({ id: TrainingOnboardingSession.id });
      expect(session).toBeDefined();
      if (!session) throw new Error("Expected an onboarding session.");
      createdSessionIds.push(session.id);

      const [plan] = await db
        .insert(TrainingCurriculumPlan)
        .values({
          onboardingSessionId: session.id,
          title: "Concurrent preparation test",
          summary: "Exercises the real unit-content uniqueness boundary.",
          targetIdentity: "Incident commander",
        })
        .returning({ id: TrainingCurriculumPlan.id });
      expect(plan).toBeDefined();
      if (!plan) throw new Error("Expected a curriculum plan.");

      const [node] = await db
        .insert(TrainingCurriculumNode)
        .values({
          planId: plan.id,
          kind: "unit",
          status: "ready",
          title: "Diagnose the failure",
          summary: "Use evidence before choosing a fix.",
          whyItMatters: "Unfounded fixes compound incidents.",
          orderIndex: 1,
          depth: 0,
          positionColumn: 0,
          positionRow: 0,
        })
        .returning({ id: TrainingCurriculumNode.id });
      expect(node).toBeDefined();
      if (!node) throw new Error("Expected a curriculum node.");

      const baseInput = {
        db,
        nodeId: node.id,
        title: "Diagnose the failure",
        seedHint: "Name the signal each hypothesis predicts.",
        clusterArcFrame: "Move from symptoms to causal evidence.",
        complexityBudget: 1 as const,
        teachbackSetup: {
          studentPersona: "A skeptical incident commander",
          openingMisconception: "The newest change must be the cause.",
          roundLadder: [
            { round: 1, objection: "Why?", objective: "Test causality." },
            {
              round: 2,
              objection: "What else?",
              objective: "Test alternatives.",
            },
            {
              round: 3,
              objection: "What next?",
              objective: "Sequence probes.",
            },
          ],
          passSignals: ["Distinguishes hypotheses"],
          failureModes: ["Guesses from timing"],
        },
        scenario: {
          title: "The slow deployment",
          focusAreas: ["causal isolation"],
        },
      };

      const seedPrompts = [
        "Which probe distinguishes the leading hypotheses?",
        "A competing generator produced a different prompt.",
      ] as const;
      const [first, second] = await Promise.all(
        seedPrompts.map((seedPrompt) =>
          trainingCurriculumRepository.createUnitContentIfAbsent({
            ...baseInput,
            seedPrompt,
          }),
        ),
      );

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first?.id).toBe(second?.id);
      expect(first?.seedPrompt).toBe(second?.seedPrompt);
      expect(seedPrompts).toContain(first?.seedPrompt);

      const persistedRows = await db.query.TrainingUnitContent.findMany({
        where: eq(TrainingUnitContent.nodeId, node.id),
      });
      expect(persistedRows).toHaveLength(1);
      expect(persistedRows[0]?.seedPrompt).toBe(first?.seedPrompt);
    },
    20_000,
  );
});
