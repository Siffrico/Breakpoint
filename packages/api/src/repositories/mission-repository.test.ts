/*
 * Integration test: everything this file proves belongs to Postgres, not to
 * TypeScript. The joined access projection, the WHERE-guarded lifecycle writes,
 * and the advisory-locked evaluation reservation are exactly the parts that
 * stubbed workflow tests cannot reach — a mocked client would only replay the
 * shape we assumed.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Effect, Exit, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import type { MissionPlan, MissionProof, MissionSpec } from "@acme/validators";
import { eq } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingMission,
  TrainingMissionEvaluation,
  TrainingOnboardingSession,
  TrainingUnitContent,
  TrainingUnitRun,
  user,
} from "@acme/db/schema";

import { MissionRepo } from "../domain/training/missions/mission-repo";
import { Db } from "../effect/db";
import { MissionRepoLive } from "./mission-repository";

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

const SPEC = {
  title: "Ship one incident review",
  summary: "Run a real review and record what changed.",
} as unknown as MissionSpec;
const PLAN = {
  steps: ["Pick an incident", "Write the review"],
} as unknown as MissionPlan;
const PROOF = {
  notes: "Attached the review doc.",
  images: [],
} as unknown as MissionProof;

const createdSessionIds: string[] = [];
const createdUserIds: string[] = [];

/** Seeds plan → node(parent) → node(unit) → unit content → unit run. */
const seedUnitRun = async ({
  parentKind,
  mode,
}: {
  parentKind: string;
  mode: "learning" | "review" | "complete";
}) => {
  const { db } = await import("@acme/db/client");
  const userId = `mission-test-${randomUUID()}`;
  await db.insert(user).values({
    id: userId,
    name: "Mission Test",
    email: `${userId}@example.test`,
  });
  createdUserIds.push(userId);

  const [session] = await db
    .insert(TrainingOnboardingSession)
    .values({ status: "ready_for_generation" })
    .returning({ id: TrainingOnboardingSession.id });
  if (!session) throw new Error("Expected an onboarding session.");
  createdSessionIds.push(session.id);

  const [plan] = await db
    .insert(TrainingCurriculumPlan)
    .values({
      onboardingSessionId: session.id,
      title: "Mission access projection",
      summary: "Exercises the joined mission access read.",
      targetIdentity: "Incident commander",
    })
    .returning({ id: TrainingCurriculumPlan.id });
  if (!plan) throw new Error("Expected a curriculum plan.");

  const nodeDefaults = {
    planId: plan.id,
    status: "ready",
    whyItMatters: "Because the projection must resolve the parent kind.",
    depth: 0,
    positionColumn: 0,
    positionRow: 0,
  };
  // The v4 shape constraint requires an ability to carry a stage and a skill
  // map; only 'root' | 'ability' | 'skill' | 'unit' are valid kinds.
  const [parentNode] = await db
    .insert(TrainingCurriculumNode)
    .values({
      ...nodeDefaults,
      kind: parentKind,
      abilityStage: parentKind === "ability" ? "skillset" : null,
      skillMap:
        parentKind === "ability" || parentKind === "skill"
          ? {
              workflow: {
                name: "Review an incident",
                steps: ["Gather", "Write"],
              },
              bandRamp: { startRating: 1000, peakRating: 1400 },
              masteryContract: { exitCriteria: ["Publishes one review"] },
              scenarioArchetype: "judge" as const,
            }
          : null,
      title: "Incident response",
      summary: "The parent that decides mission eligibility.",
      orderIndex: 0,
    })
    .returning({ id: TrainingCurriculumNode.id });
  if (!parentNode) throw new Error("Expected a parent node.");

  const [unitNode] = await db
    .insert(TrainingCurriculumNode)
    .values({
      ...nodeDefaults,
      kind: "unit",
      parentNodeId: parentNode.id,
      title: "Diagnose the failure",
      summary: "Use evidence before choosing a fix.",
      orderIndex: 1,
    })
    .returning({ id: TrainingCurriculumNode.id });
  if (!unitNode) throw new Error("Expected a unit node.");

  const [unit] = await db
    .insert(TrainingUnitContent)
    .values({
      nodeId: unitNode.id,
      title: "Diagnose the failure",
      seedPrompt: "Walk the evidence.",
      teachbackSetup: {
        studentPersona: "A new responder",
        openingMisconception: "Restarting always fixes it.",
      },
      scenarioTitle: "The pager fires",
      scenarioFocusAreas: ["evidence first", "blameless writeup"],
    })
    .returning({ id: TrainingUnitContent.id });
  if (!unit) throw new Error("Expected unit content.");

  const [run] = await db
    .insert(TrainingUnitRun)
    .values({
      unitContentId: unit.id,
      sessionId: session.id,
      userId,
      mode,
      experienceJson: {
        id: "breakpoint-mentor",
        version: 1,
        main: { instructions: "Mentor the active capability." },
        reviewer: {
          instructions: "Pressure-test the learned capabilities.",
        },
      },
      masteryContractJson: {
        version: 1,
        dimensions: [
          {
            id: "perform-workflow",
            name: "Perform the workflow",
            description: "Perform and defend the workflow.",
            passSignals: ["Performs it"],
            failSignals: ["Cannot perform it"],
            surrogateTraps: ["Only names it"],
          },
        ],
      },
      capabilityTodosJson: [],
    })
    .returning({ id: TrainingUnitRun.id });
  if (!run) throw new Error("Expected a unit run.");

  return {
    userId,
    sessionId: session.id,
    unitContentId: unit.id,
    unitRunId: run.id,
  };
};

const runRepo = async <A, E>(
  effect: Effect.Effect<A, E, MissionRepo>,
): Promise<Exit.Exit<A, E>> => {
  const { db } = await import("@acme/db/client");
  return Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(
        MissionRepoLive.pipe(Layer.provide(Layer.succeed(Db, { client: db }))),
      ),
    ),
  );
};

const expectSuccess = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (!Exit.isSuccess(exit))
    throw new Error(`Expected success: ${String(exit.cause)}`);
  return exit.value;
};

const failureTag = <A, E>(exit: Exit.Exit<A, E>): unknown => {
  if (Exit.isSuccess(exit)) throw new Error("Expected a failure.");
  const error = exit.cause as unknown as { reasons?: { error?: unknown }[] };
  return error.reasons?.[0]?.error;
};

describe("MissionRepoLive", () => {
  afterEach(async () => {
    if (!process.env.POSTGRES_URL) return;
    const { db } = await import("@acme/db/client");
    for (const sessionId of createdSessionIds.splice(0)) {
      await db
        .delete(TrainingOnboardingSession)
        .where(eq(TrainingOnboardingSession.id, sessionId));
    }
    for (const userId of createdUserIds.splice(0)) {
      await db.delete(user).where(eq(user.id, userId));
    }
  });

  it.skipIf(!process.env.POSTGRES_URL)(
    "resolves the whole access projection, including the parent kind and a null mission, in one read",
    async () => {
      const seed = await seedUnitRun({
        parentKind: "ability",
        mode: "complete",
      });

      const access = expectSuccess(
        await runRepo(
          Effect.gen(function* () {
            const repo = yield* MissionRepo;
            return yield* repo.loadMissionAccess({
              userId: seed.userId,
              unitRunId: seed.unitRunId,
            });
          }),
        ),
      );

      expect(access).not.toBeNull();
      expect(access?.run.mode).toBe("complete");
      expect(access?.parentNode?.kind).toBe("ability");
      expect(access?.plan.targetIdentity).toBe("Incident commander");
      expect(access?.unit.scenarioFocusAreas).toEqual([
        "evidence first",
        "blameless writeup",
      ]);
      // The mission row is a LEFT JOIN: no mission yet must not drop the row.
      expect(access?.mission).toBeNull();
    },
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "refuses to start a mission that has no plan, and classifies why",
    async () => {
      const seed = await seedUnitRun({
        parentKind: "ability",
        mode: "complete",
      });
      const { db } = await import("@acme/db/client");
      await db
        .insert(TrainingMission)
        .values({ userId: seed.userId, unitRunId: seed.unitRunId });

      const exit = await runRepo(
        Effect.gen(function* () {
          const repo = yield* MissionRepo;
          return yield* repo.start({
            userId: seed.userId,
            unitRunId: seed.unitRunId,
          });
        }),
      );

      expect(failureTag(exit)).toMatchObject({
        _tag: "MissionNotReadyError",
        operation: "start",
      });
      const row = await db.query.TrainingMission.findFirst({
        where: eq(TrainingMission.unitRunId, seed.unitRunId),
      });
      expect(row?.status).toBe("drafting");
    },
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "rejects a plan rewrite on a completed mission inside the write itself",
    async () => {
      const seed = await seedUnitRun({
        parentKind: "ability",
        mode: "complete",
      });
      const { db } = await import("@acme/db/client");
      await db.insert(TrainingMission).values({
        userId: seed.userId,
        unitRunId: seed.unitRunId,
        status: "completed",
        spec: SPEC,
        plan: PLAN,
      });

      const exit = await runRepo(
        Effect.gen(function* () {
          const repo = yield* MissionRepo;
          return yield* repo.confirmPlan({
            userId: seed.userId,
            unitRunId: seed.unitRunId,
            spec: SPEC,
            plan: { steps: ["Rewritten"] } as unknown as MissionPlan,
          });
        }),
      );

      expect(failureTag(exit)).toMatchObject({
        _tag: "MissionConflictError",
        reason: "already_completed",
      });
      const row = await db.query.TrainingMission.findFirst({
        where: eq(TrainingMission.unitRunId, seed.unitRunId),
      });
      expect(row?.plan).toEqual(PLAN);
    },
  );

  it.skipIf(!process.env.POSTGRES_URL)(
    "gives exactly one of two concurrent evaluations the reservation",
    async () => {
      const seed = await seedUnitRun({
        parentKind: "ability",
        mode: "complete",
      });
      const { db } = await import("@acme/db/client");
      const [mission] = await db
        .insert(TrainingMission)
        .values({
          userId: seed.userId,
          unitRunId: seed.unitRunId,
          status: "active",
          spec: SPEC,
          plan: PLAN,
        })
        .returning({ id: TrainingMission.id });
      if (!mission) throw new Error("Expected a mission.");

      const reserve = () =>
        runRepo(
          Effect.gen(function* () {
            const repo = yield* MissionRepo;
            return yield* repo.reserveEvaluation({
              userId: seed.userId,
              unitRunId: seed.unitRunId,
              proof: PROOF,
            });
          }),
        );

      const [first, second] = await Promise.all([reserve(), reserve()]);
      const succeeded = [first, second].filter(Exit.isSuccess);
      const [failed, ...otherFailures] = [first, second].filter(
        (exit) => !Exit.isSuccess(exit),
      );

      expect(succeeded).toHaveLength(1);
      expect(otherFailures).toHaveLength(0);
      if (!failed) throw new Error("Expected one reservation to be refused.");
      expect(failureTag(failed)).toMatchObject({
        _tag: "MissionConflictError",
        reason: "evaluation_in_flight",
      });

      const attempts = await db.query.TrainingMissionEvaluation.findMany({
        where: eq(TrainingMissionEvaluation.missionId, mission.id),
      });
      expect(attempts).toHaveLength(1);
    },
  );
});
