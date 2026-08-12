import { Effect, Layer } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import type { MissionPlan, MissionSpec } from "@acme/validators";
import { alias, and, asc, eq, inArray, isNotNull, ne, sql } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingMission,
  TrainingMissionEvaluation,
  TrainingUnitContent,
  TrainingUnitRun,
} from "@acme/db/schema";

import type { DatabaseClient } from "../effect/db";
import {
  MissionConflictError,
  MissionNotReadyError,
} from "../domain/training/missions/mission-errors";
import { RESUMABLE_MISSION_STATUSES } from "../domain/training/missions/mission-lifecycle";
import { MissionRepo } from "../domain/training/missions/mission-repo";
import { Db, queryWithClient } from "../effect/db";

type Database = typeof databaseClient;
const STALE_EVALUATION_MS = 2 * 60 * 1_000;

/**
 * What the reservation transaction reports. The transaction stays pure data and
 * the Effect failure is raised outside it, so a rejected reservation never
 * rolls back the stale-attempt cleanup that legitimately committed.
 */
type ReservationOutcome =
  | {
      readonly kind: "reserved";
      readonly attemptId: string;
      readonly attemptNumber: number;
      readonly firstScore: number | null;
      readonly mission: {
        readonly id: string;
        readonly spec: MissionSpec;
        readonly plan: MissionPlan;
      };
    }
  | { readonly kind: "in-flight" }
  | { readonly kind: "not-evaluable" };

/**
 * Live Drizzle adapter for the mission slice, built the same way as
 * ProfileRepoLive: it captures the request or transaction client at layer
 * construction and routes every call through queryWithClient.
 *
 * Every lifecycle guard rides in the WHERE clause of its own write rather than
 * a preceding read — `start` and `confirmPlan` used to read-then-write, which
 * left a race window between the check and the mutation.
 */
export const MissionRepoLive = Layer.effect(
  MissionRepo,
  Effect.gen(function* () {
    const { client } = yield* Db;
    const query = <A>(
      operation: string,
      run: (client: DatabaseClient) => Promise<A>,
    ) => queryWithClient(client, operation, run);

    return {
      findUnitRunId: ({ userId, unitContentId, sessionId }) =>
        query("findMissionUnitRunId", async (client) => {
          const run = await client.query.TrainingUnitRun.findFirst({
            columns: { id: true },
            where: and(
              eq(TrainingUnitRun.userId, userId),
              eq(TrainingUnitRun.unitContentId, unitContentId),
              eq(TrainingUnitRun.sessionId, sessionId),
              eq(TrainingUnitRun.kind, "education"),
            ),
          });
          return run?.id ?? null;
        }),

      // One joined read for run + unit + node + parent + plan + mission. This is
      // the entire pre-stream preamble; it used to be six sequential queries.
      loadMissionAccess: ({ userId, unitRunId }) =>
        query("loadMissionAccess", async (client) => {
          const parentNode = alias(TrainingCurriculumNode, "parent_node");
          const [row] = await client
            .select({
              run: {
                id: TrainingUnitRun.id,
                sessionId: TrainingUnitRun.sessionId,
                mode: sql<string>`case when ${TrainingUnitRun.cursorJson}->'step'->>'kind' = 'complete' then 'complete' else 'learning' end`,
              },
              unit: {
                id: TrainingUnitContent.id,
                title: TrainingUnitContent.title,
                scenarioFocusAreas: TrainingUnitContent.scenarioFocusAreas,
              },
              node: {
                id: TrainingCurriculumNode.id,
                summary: TrainingCurriculumNode.summary,
              },
              parentKind: parentNode.kind,
              plan: { targetIdentity: TrainingCurriculumPlan.targetIdentity },
              mission: TrainingMission,
            })
            .from(TrainingUnitRun)
            .innerJoin(
              TrainingUnitContent,
              eq(TrainingUnitRun.unitContentId, TrainingUnitContent.id),
            )
            .innerJoin(
              TrainingCurriculumNode,
              eq(TrainingUnitContent.nodeId, TrainingCurriculumNode.id),
            )
            .innerJoin(
              TrainingCurriculumPlan,
              eq(TrainingCurriculumNode.planId, TrainingCurriculumPlan.id),
            )
            .leftJoin(
              parentNode,
              eq(TrainingCurriculumNode.parentNodeId, parentNode.id),
            )
            .leftJoin(
              TrainingMission,
              and(
                eq(TrainingMission.unitRunId, TrainingUnitRun.id),
                eq(TrainingMission.userId, userId),
              ),
            )
            .where(
              and(
                eq(TrainingUnitRun.id, unitRunId),
                eq(TrainingUnitRun.userId, userId),
              ),
            )
            .limit(1);

          if (!row) return null;
          return {
            run: row.run,
            unit: row.unit,
            node: row.node,
            parentNode:
              row.parentKind === null ? null : { kind: row.parentKind },
            plan: row.plan,
            mission: row.mission,
          };
        }),

      listEvaluations: (missionId) =>
        query("listMissionEvaluations", (client) =>
          client.query.TrainingMissionEvaluation.findMany({
            where: eq(TrainingMissionEvaluation.missionId, missionId),
            orderBy: asc(TrainingMissionEvaluation.attemptNumber),
          }),
        ),

      listResumable: ({ userId, sessionId }) =>
        query("listResumableMissions", (client) =>
          client
            .select({
              unitRunId: TrainingMission.unitRunId,
              status: TrainingMission.status,
              spec: TrainingMission.spec,
            })
            .from(TrainingMission)
            .innerJoin(
              TrainingUnitRun,
              eq(TrainingMission.unitRunId, TrainingUnitRun.id),
            )
            .where(
              and(
                eq(TrainingMission.userId, userId),
                eq(TrainingUnitRun.sessionId, sessionId),
                inArray(TrainingMission.status, RESUMABLE_MISSION_STATUSES),
              ),
            ),
        ),

      upsertTranscript: ({ userId, unitRunId, messages }) =>
        query("upsertMissionTranscript", async (client) => {
          await client
            .insert(TrainingMission)
            .values({ userId, unitRunId, messages })
            .onConflictDoUpdate({
              target: TrainingMission.unitRunId,
              set: { messages },
              setWhere: eq(TrainingMission.userId, userId),
            });
        }),

      confirmPlan: ({ userId, unitRunId, spec, plan }) =>
        Effect.gen(function* () {
          // The completed-mission guard rides in setWhere, so a late tool call
          // cannot rewrite the plan of a mission that already closed.
          const rows = yield* query("confirmMissionPlan", (client) =>
            client
              .insert(TrainingMission)
              .values({ userId, unitRunId, spec, plan, messages: [] })
              .onConflictDoUpdate({
                target: TrainingMission.unitRunId,
                set: { spec, plan },
                setWhere: and(
                  eq(TrainingMission.userId, userId),
                  ne(TrainingMission.status, "completed"),
                ),
              })
              .returning({ id: TrainingMission.id }),
          );
          if (rows.length === 0) {
            return yield* new MissionConflictError({
              reason: "already_completed",
            });
          }
        }),

      start: ({ userId, unitRunId }) =>
        Effect.gen(function* () {
          const rows = yield* query("startMission", (client) =>
            client
              .update(TrainingMission)
              .set({ status: "active" })
              .where(
                and(
                  eq(TrainingMission.userId, userId),
                  eq(TrainingMission.unitRunId, unitRunId),
                  inArray(TrainingMission.status, RESUMABLE_MISSION_STATUSES),
                  isNotNull(TrainingMission.spec),
                  isNotNull(TrainingMission.plan),
                ),
              )
              .returning({ id: TrainingMission.id }),
          );
          if (rows.length > 0) return;

          // Copy-only classification: the write above already decided. This read
          // exists solely to tell the learner which guard rejected them and is
          // never treated as an authorization check.
          const mission = yield* query(
            "classifyMissionStartRejection",
            (client) =>
              client.query.TrainingMission.findFirst({
                columns: { status: true, spec: true, plan: true },
                where: and(
                  eq(TrainingMission.userId, userId),
                  eq(TrainingMission.unitRunId, unitRunId),
                ),
              }),
          );
          if (!mission?.spec || !mission.plan) {
            return yield* new MissionNotReadyError({ operation: "start" });
          }
          return yield* new MissionConflictError({ reason: "start_race" });
        }),

      reserveEvaluation: ({ userId, unitRunId, proof }) =>
        Effect.gen(function* () {
          const outcome = yield* query(
            "reserveMissionEvaluation",
            (client): Promise<ReservationOutcome> =>
              client.transaction(async (tx) => {
                const transactionDb = tx as unknown as Database;
                await transactionDb.execute(
                  sql`select pg_advisory_xact_lock(hashtext(${unitRunId}), hashtext('mission-evaluation'))`,
                );
                const mission =
                  await transactionDb.query.TrainingMission.findFirst({
                    where: and(
                      eq(TrainingMission.userId, userId),
                      eq(TrainingMission.unitRunId, unitRunId),
                    ),
                  });
                if (
                  mission?.status !== "active" ||
                  !mission.spec ||
                  !mission.plan
                )
                  return { kind: "not-evaluable" };

                const attempts =
                  await transactionDb.query.TrainingMissionEvaluation.findMany({
                    where: eq(TrainingMissionEvaluation.missionId, mission.id),
                    orderBy: asc(TrainingMissionEvaluation.attemptNumber),
                  });
                const pendingAttempt = attempts.find(
                  (attempt) => attempt.status === "evaluating",
                );
                if (pendingAttempt) {
                  if (
                    Date.now() - pendingAttempt.createdAt.getTime() <
                    STALE_EVALUATION_MS
                  )
                    return { kind: "in-flight" };
                  await transactionDb
                    .delete(TrainingMissionEvaluation)
                    .where(eq(TrainingMissionEvaluation.id, pendingAttempt.id));
                }

                const evaluatedAttempts = attempts.filter(
                  (attempt) => attempt.status === "evaluated",
                );
                const attemptNumber = evaluatedAttempts.length + 1;
                const [attempt] = await transactionDb
                  .insert(TrainingMissionEvaluation)
                  .values({ missionId: mission.id, attemptNumber, proof })
                  .returning({ id: TrainingMissionEvaluation.id });
                if (!attempt) return { kind: "not-evaluable" };

                return {
                  kind: "reserved",
                  attemptId: attempt.id,
                  attemptNumber,
                  firstScore: evaluatedAttempts[0]?.evaluation?.score ?? null,
                  mission: {
                    id: mission.id,
                    spec: mission.spec,
                    plan: mission.plan,
                  },
                };
              }),
          );

          if (outcome.kind === "in-flight") {
            return yield* new MissionConflictError({
              reason: "evaluation_in_flight",
            });
          }
          if (outcome.kind === "not-evaluable") {
            return yield* new MissionNotReadyError({ operation: "evaluate" });
          }
          return {
            attemptId: outcome.attemptId,
            attemptNumber: outcome.attemptNumber,
            firstScore: outcome.firstScore,
            mission: outcome.mission,
          };
        }),

      finishEvaluation: ({ missionId, attemptId, proof, evaluation }) =>
        Effect.gen(function* () {
          const saved = yield* query("finishMissionEvaluation", (client) =>
            client.transaction(async (tx) => {
              const transactionDb = tx as unknown as Database;
              const updatedAttempt = await transactionDb
                .update(TrainingMissionEvaluation)
                .set({ status: "evaluated", evaluation })
                .where(
                  and(
                    eq(TrainingMissionEvaluation.id, attemptId),
                    eq(TrainingMissionEvaluation.missionId, missionId),
                    eq(TrainingMissionEvaluation.status, "evaluating"),
                  ),
                )
                .returning({ id: TrainingMissionEvaluation.id });
              if (updatedAttempt.length === 0) return false;
              if (evaluation.passed) {
                await transactionDb
                  .update(TrainingMission)
                  .set({
                    proof,
                    debrief: evaluation.summary,
                    status: "completed",
                  })
                  .where(eq(TrainingMission.id, missionId));
              }
              return true;
            }),
          );
          if (!saved) {
            return yield* new MissionConflictError({ reason: "finish_race" });
          }
        }),

      cancelEvaluation: (attemptId) =>
        query("cancelMissionEvaluation", async (client) => {
          await client
            .delete(TrainingMissionEvaluation)
            .where(
              and(
                eq(TrainingMissionEvaluation.id, attemptId),
                eq(TrainingMissionEvaluation.status, "evaluating"),
              ),
            );
        }),
    };
  }),
);
