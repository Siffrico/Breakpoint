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
  whatToLearn: "distributed systems: real operational judgment under failure",
  whatToMake: "a replicated service they can break and repair on purpose",
  interests: [
    "Vercel: making difficult deployment work feel immediate and simple.",
  ],
  projectName: "distributed systems",
  targetIdentity: "backend engineer",
  summary: "Build reliable replicated services.",
  abilities: [
    "Diagnose Distributed Systems Failures",
    "Architect Reliable Replicated Services",
  ],
};

const sourceKey = JSON.stringify({
  projectName: "distributed-systems",
  targetIdentity: input.targetIdentity,
  summary: input.summary,
  whatToLearn: input.whatToLearn,
  whatToMake: input.whatToMake,
  interests: input.interests,
  abilities: input.abilities,
  startingPoint: null,
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
    abilities: [
      {
        title: "Diagnose replicated-service failures",
        summary: "Trace reads, writes, lag, and acknowledgement boundaries.",
        whyItMatters: "Reliability claims fail here first.",
        workflow: {
          name: "Diagnose a replicated-service failure",
          steps: [
            "Collect evidence",
            "Trace message flow",
            "Choose the next probe",
          ],
        },
        bandRamp: { startRating: 1000, peakRating: 1600 },
        masteryContract: {
          exitCriteria: [
            "Diagnoses the causal mechanism from incomplete evidence.",
          ],
        },
        scenarioArchetype: "judge" as const,
        scenarioArchetypeWhy:
          "Diagnosis is evaluated judgment over symptoms and evidence.",
        skills: [
          {
            title: "Trace acknowledgement boundaries",
            summary: "Follow one write through its replicas.",
            whyItMatters: "Acknowledgement gaps hide the real failure.",
            workflow: {
              name: "Trace a write's acknowledgements",
              steps: [
                "Find the write",
                "List the replicas",
                "Mark the ack boundary",
              ],
            },
            masteryContract: {
              exitCriteria: ["Marks the acknowledgement boundary correctly."],
            },
          },
          {
            title: "Read replication lag evidence",
            summary: "Tell lag apart from loss.",
            whyItMatters: "The wrong call wastes the incident.",
            workflow: {
              name: "Read lag evidence",
              steps: ["Collect offsets", "Compare clocks", "Name the gap"],
            },
            masteryContract: {
              exitCriteria: ["Distinguishes lag from loss on real evidence."],
            },
          },
          {
            title: "Choose the next probe",
            summary: "Pick the observation that splits hypotheses fastest.",
            whyItMatters: "Incidents are time-boxed.",
            workflow: {
              name: "Choose a probe",
              steps: ["List hypotheses", "Rank splits", "Run the probe"],
            },
            masteryContract: {
              exitCriteria: ["Chooses the hypothesis-splitting probe."],
            },
          },
        ],
      },
      {
        title: "Design safe retries",
        summary: "Prevent duplicate effects across partial failures.",
        whyItMatters: "Retries amplify unsafe state transitions.",
        workflow: {
          name: "Design a retry-safe operation",
          steps: [
            "Locate effects",
            "Define identity",
            "Verify replay behavior",
          ],
        },
        bandRamp: { startRating: 1000, peakRating: 1600 },
        masteryContract: {
          exitCriteria: ["Proves retry safety under ambiguity."],
        },
        scenarioArchetype: "transform" as const,
        scenarioArchetypeWhy:
          "Retry safety is produced by designing the operation itself.",
        skills: [
          {
            title: "Locate side effects",
            summary: "Find every state change a request causes.",
            whyItMatters: "Unseen effects are the ones that double-fire.",
            workflow: {
              name: "Locate effects",
              steps: [
                "Trace the handler",
                "List writes",
                "Mark external calls",
              ],
            },
            masteryContract: {
              exitCriteria: ["Lists every effect of a handler."],
            },
          },
          {
            title: "Define operation identity",
            summary: "Key retries on intent, not transport.",
            whyItMatters: "Wrong keys dedupe the wrong things.",
            workflow: {
              name: "Define identity",
              steps: ["Name the intent", "Choose the key", "Set the window"],
            },
            masteryContract: {
              exitCriteria: ["Chooses a key that survives retries."],
            },
          },
          {
            title: "Verify replay behavior",
            summary: "Prove a replay cannot double-apply.",
            whyItMatters: "Assertions beat assumptions in incident review.",
            workflow: {
              name: "Verify replay",
              steps: [
                "Replay the request",
                "Inspect state",
                "Prove idempotence",
              ],
            },
            masteryContract: {
              exitCriteria: ["Demonstrates idempotence under replay."],
            },
          },
        ],
      },
    ],
  },
};

const overview: ProjectOverviewOutput = {
  title: "Distributed systems map",
  summary: "A field map for reliable replicated services.",
  body: "Distributed systems are about preserving useful guarantees while machines, messages, and time fail independently. ".repeat(
    7,
  ),
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
          // AI: curriculum + overview are
          // "generated_pending_save" so the build re-persists them (save_only)
          // into a freshly-created shell — exercising profile, plan, nodes, and
          // overview writes end to end in Postgres.
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
          expect(result.data.moduleCount).toBe(2);
          expect(result.data.firstUnitId).toBeNull();

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
            rawNodes.some((node) => node.skillMap),
            `Expected at least one persisted skill map. Raw DB values: ${JSON.stringify(
              rawNodes.map((node) => ({
                kind: node.kind,
                skillMap: node.skillMap,
              })),
            )}`,
          ).toBe(true);

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
