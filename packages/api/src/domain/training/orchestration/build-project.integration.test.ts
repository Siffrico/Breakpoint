/*
 * Integration test: exercises the real repositories + Postgres on purpose, so it
 * intentionally opts out of the domain "persistence-agnostic" import rule.
 */
/* eslint-disable no-restricted-imports */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { eq } from "@acme/db";
import { TrainingCurriculumNode } from "@acme/db/schema";

import type {
  CurriculumDesignerOutput,
  OnboardingPacket,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type { CreateProjectInput } from "./build-project";
import { buildProjectCheckpointRepository } from "../../../repositories/build-project-checkpoint-repository";
import { createBuildProjectDeps } from "../../../repositories/build-project-repository-deps";
import { trainingCurriculumRepository } from "../../../repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "../../../repositories/training-onboarding-repository";
import { buildProjectFromOnboarding } from "./build-project";

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

const input: CreateProjectInput = {
  projectName: "distributed systems",
  targetIdentity: "backend engineer",
  summary: "Build reliable replicated services.",
};

const sourceKey = JSON.stringify({
  projectName: "distributed-systems",
  targetIdentity: input.targetIdentity,
  summary: input.summary,
});

const packet: OnboardingPacket = {
  targetIdentity: "backend engineer",
  motivation: "Build reliable systems.",
  currentBaseline: "Knows terms but needs operational judgment.",
  hardMoments: ["Choosing consistency tradeoffs under pressure."],
  constraints: [],
  proofOfProgress: "Can explain and repair replicated-service failures.",
  identityFriction: "Reaches for slogans before tracing mechanics.",
  behaviorSignals: [
    "Traces concrete failure paths.",
    "Names tradeoffs before choosing.",
    "Repairs weak explanations.",
  ],
  confidenceFlags: [],
};

const buildUnit = (index: number) => ({
  title: `Unit ${index + 1}`,
  learningGoal:
    "Given a concrete replicated-service failure, identify the causal mechanism and choose the next operational move.",
});

const curriculum: CurriculumDesignerOutput = {
  identityReport: {
    targetIdentity: "backend engineer",
    headline: "Reliable systems operator",
    motivation: "Build reliable systems.",
    currentBaseline: "Knows terms but needs operational judgment.",
    hardMoments: ["Choosing consistency tradeoffs under pressure."],
    constraints: [],
    proofOfProgress: "Can explain and repair replicated-service failures.",
    behaviorSignals: [
      "Traces concrete failure paths.",
      "Names tradeoffs before choosing.",
      "Repairs weak explanations.",
    ],
    confidenceFlags: [],
  },
  beforeAfter: {
    headline: "From slogans to mechanics.",
    beforeSummary: "Uses distributed-systems terms loosely.",
    afterSummary: "Traces concrete failure mechanics.",
    contrastPairs: [
      { before: "Names CAP.", after: "Traces the failed guarantee." },
      { before: "Guesses retry.", after: "Checks idempotency first." },
      { before: "Trusts quorum.", after: "Models replica intersections." },
    ],
    firstShift: "Trace the messages before naming the pattern.",
  },
  planDraft: {
    title: "Distributed systems",
    summary: "Practice operational judgment for replicated services.",
    targetIdentity: "backend engineer",
    clusters: [
      {
        title: "Diagnose replicated-service failures",
        summary: "Trace reads, writes, lag, and acknowledgement boundaries.",
        whyItMatters: "Reliability claims fail here first.",
        units: Array.from({ length: 20 }, (_, index) => buildUnit(index)),
        bandRamp: { startRating: 1000, peakRating: 1600 },
        simulation: {
          title: "Checkout under replica lag",
          summary: "Diagnose stale inventory during a live incident.",
          whyItMatters: "It combines user impact and consistency mechanics.",
        },
      },
    ],
    integrationLayers: [],
  },
};

const overview: ProjectOverviewOutput = {
  title: "Distributed systems map",
  summary: "A field map for reliable replicated services.",
  body: "Distributed systems are about preserving useful guarantees while machines, messages, and time fail independently.",
};

const rollbackMessage = "ROLLBACK_BUILD_PROJECT_INTEGRATION_TEST";

describe("buildProjectFromOnboarding repository integration", () => {
  it.skipIf(!process.env.POSTGRES_URL)(
    "persists checkpoints, profile, plan, nodes, and difficulty bands in Postgres",
    async () => {
      const { db } = await import("@acme/db/client");

      try {
        await db.transaction(async (tx) => {
          const testDb = tx as unknown as typeof db;
          const session = await trainingOnboardingRepository.createSession({
            db: testDb,
            userId: null,
          });
          expect(session).not.toBeNull();
          if (!session) throw new Error("Expected test session.");

          // Seed the artifact registry so the real persistence runs without any
          // AI: goals is cached "complete"; curriculum + overview are
          // "generated_pending_save" so the build re-persists them (save_only)
          // into a freshly-created shell — exercising profile, plan, nodes, and
          // overview writes end to end in Postgres.
          await buildProjectCheckpointRepository.upsertArtifact({
            db: testDb,
            sessionId: session.id,
            step: "goals",
            sourceKey,
            payload: packet,
            status: "complete",
          });
          await buildProjectCheckpointRepository.upsertArtifact({
            db: testDb,
            sessionId: session.id,
            step: "curriculum",
            sourceKey,
            payload: curriculum,
            status: "generated_pending_save",
            failureKind: "save",
          });
          await buildProjectCheckpointRepository.upsertArtifact({
            db: testDb,
            sessionId: session.id,
            step: "overview",
            sourceKey,
            payload: overview,
            status: "generated_pending_save",
            failureKind: "save",
          });

          const result = await buildProjectFromOnboarding({
            sessionId: session.id,
            userId: null,
            input,
            transcript: [],
            deps: createBuildProjectDeps(testDb),
            onProgress: () => undefined,
          });

          if (!result.success) {
            throw new Error(result.error);
          }
          expect(result.data.moduleCount).toBe(20);
          expect(result.data.firstUnitId).toEqual(expect.any(String));

          const run = await buildProjectCheckpointRepository.getRun({
            db: testDb,
            sessionId: session.id,
          });
          expect(run?.status).toBe("complete");

          const activePlan = await trainingCurriculumRepository.getActivePlan({
            db: testDb,
            sessionId: session.id,
          });
          const rawNodes = activePlan
            ? await testDb.query.TrainingCurriculumNode.findMany({
                where: eq(TrainingCurriculumNode.planId, activePlan.id),
              })
            : [];
          expect(
            activePlan?.nodes.some((node) => node.difficultyBands),
            `Expected at least one active-plan node with difficultyBands. Raw DB values: ${JSON.stringify(
              rawNodes.map((node) => ({
                kind: node.kind,
                difficultyBands: node.difficultyBands,
              })),
            )}`,
          ).toBe(true);
          expect(activePlan?.nodes[0]?.difficultyBands).toBeNull();

          throw new Error(rollbackMessage);
        });
      } catch (error) {
        if (error instanceof Error && error.message === rollbackMessage) {
          return;
        }

        throw error;
      }
    },
    20_000,
  );
});
