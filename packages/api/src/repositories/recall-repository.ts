import { Effect, Layer } from "effect";

import { and, asc, desc, eq, isNotNull, lte, ne, or, sql } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingKnowledgeItem,
  TrainingKnowledgeQuestion,
  TrainingOnboardingSession,
  TrainingRecallSubmission,
  TrainingRecallTask,
  TrainingUnitContent,
} from "@acme/db/schema";
import {
  RecallCorrectionRecordSchema,
  RecallKnowledgeSnapshotSchema,
  RecallScenarioSchema,
  RecallTaskStateSchema,
  UnitContextSchema,
} from "@acme/validators";

import type { RecallTaskRecord } from "../domain/training/recall/recall-repo";
import type { DatabaseClient } from "../effect/db";
import {
  RecallConflictError,
  RecallLeaseError,
  RecallNotFoundError,
} from "../domain/training/recall/errors";
import { RecallRepo } from "../domain/training/recall/recall-repo";
import { transitionRecallTask } from "../domain/training/recall/state";
import { Db, makeDbError, queryWithClient } from "../effect/db";

const PREPARATION_LEASE_MS = 2 * 60 * 1_000;
const TURN_LEASE_MS = 2 * 60 * 1_000;

const activePlanForTask = sql`exists (
  select 1 from ${TrainingCurriculumPlan} as recall_plan
  join ${TrainingOnboardingSession} as recall_session
    on recall_session.id = recall_plan.onboarding_session_id
  where recall_plan.id = ${TrainingRecallTask.planId}
    and recall_plan.onboarding_session_id = ${TrainingRecallTask.sessionId}
    and recall_plan.status = 'active'
    and recall_plan.profile_version_id is not null
    and recall_session.user_id = ${TrainingRecallTask.userId}
)`;

const leaseExpiry = (now: Date, duration: number) =>
  new Date(now.getTime() + duration);

const mapTask = (
  row: typeof TrainingRecallTask.$inferSelect,
): RecallTaskRecord => ({
  id: row.id,
  userId: row.userId,
  planId: row.planId,
  sessionId: row.sessionId,
  knowledgeItemId: row.knowledgeItemId,
  originalTeachingUnitNodeId: row.originalTeachingUnitNodeId,
  strengthAtReservation: row.strengthAtReservation,
  knowledgeSnapshot: RecallKnowledgeSnapshotSchema.parse(
    row.knowledgeSnapshotJson,
  ),
  scenario: row.scenarioJson
    ? RecallScenarioSchema.parse(row.scenarioJson)
    : null,
  state: RecallTaskStateSchema.parse(row.state),
  interactionId: row.interactionId,
  currentQuestion: row.currentQuestion,
  firstRetrieval: row.firstRetrievalJson,
  correctionHistory: RecallCorrectionRecordSchema.array().parse(
    row.correctionHistoryJson,
  ),
  pausedAt: row.pausedAt,
});

const previousChallenges = async (
  client: DatabaseClient,
  knowledgeItemId: string | null,
) => {
  if (!knowledgeItemId) return [];
  const rows = await client.query.TrainingRecallTask.findMany({
    where: and(
      eq(TrainingRecallTask.knowledgeItemId, knowledgeItemId),
      isNotNull(TrainingRecallTask.scenarioJson),
    ),
    orderBy: [desc(TrainingRecallTask.createdAt)],
    limit: 5,
  });
  return rows.flatMap((row) => {
    const scenario = RecallScenarioSchema.safeParse(row.scenarioJson);
    return scenario.success ? [scenario.data.challenge] : [];
  });
};

export const RecallRepoLive = Layer.effect(
  RecallRepo,
  Effect.gen(function* () {
    const { client } = yield* Db;
    const query = <A>(
      operation: string,
      run: (database: DatabaseClient) => Promise<A>,
    ) => queryWithClient(client, operation, run);
    const domainQuery = <A>(
      operation: string,
      run: (database: DatabaseClient) => Promise<A>,
    ) =>
      Effect.tryPromise({
        try: () => run(client),
        catch: (cause) =>
          cause instanceof RecallNotFoundError ||
          cause instanceof RecallConflictError ||
          cause instanceof RecallLeaseError
            ? cause
            : makeDbError(operation, cause),
      });

    return {
      reserveDueTask: ({ userId, sessionId, planId, leaseId, now }) =>
        query("reserveDueRecallTask", (database) =>
          database.transaction(async (tx) => {
            const transaction = tx as unknown as DatabaseClient;
            await transaction.execute(
              sql`select pg_advisory_xact_lock(hashtext(${planId}), hashtext('dedicated-recall-preparation'))`,
            );
            const [activePlan] = await transaction
              .select({ id: TrainingCurriculumPlan.id })
              .from(TrainingCurriculumPlan)
              .innerJoin(
                TrainingOnboardingSession,
                eq(
                  TrainingOnboardingSession.id,
                  TrainingCurriculumPlan.onboardingSessionId,
                ),
              )
              .where(
                and(
                  eq(TrainingCurriculumPlan.id, planId),
                  eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
                  eq(TrainingCurriculumPlan.status, "active"),
                  isNotNull(TrainingCurriculumPlan.profileVersionId),
                  eq(TrainingOnboardingSession.userId, userId),
                ),
              )
              .limit(1);
            if (!activePlan) return null;
            const existing =
              await transaction.query.TrainingRecallTask.findFirst({
                where: and(
                  eq(TrainingRecallTask.planId, planId),
                  ne(TrainingRecallTask.state, "complete"),
                  activePlanForTask,
                ),
              });
            if (existing) {
              if (
                existing.state !== "preparing" ||
                (existing.preparationLeaseExpiresAt &&
                  existing.preparationLeaseExpiresAt > now)
              ) {
                return null;
              }
              const [claimed] = await transaction
                .update(TrainingRecallTask)
                .set({
                  preparationLeaseId: leaseId,
                  preparationLeaseExpiresAt: leaseExpiry(
                    now,
                    PREPARATION_LEASE_MS,
                  ),
                })
                .where(
                  and(
                    eq(TrainingRecallTask.id, existing.id),
                    eq(TrainingRecallTask.state, "preparing"),
                    or(
                      eq(TrainingRecallTask.preparationLeaseId, leaseId),
                      lte(TrainingRecallTask.preparationLeaseExpiresAt, now),
                      sql`${TrainingRecallTask.preparationLeaseExpiresAt} is null`,
                    ),
                  ),
                )
                .returning();
              if (!claimed) return null;
              return {
                task: mapTask(claimed),
                preparationLeaseId: leaseId,
                previousChallenges: await previousChallenges(
                  transaction,
                  claimed.knowledgeItemId,
                ),
              };
            }

            const anchor = sql`coalesce(${TrainingKnowledgeItem.lastReinforcedAt}, ${TrainingKnowledgeItem.checkedAt})`;
            const intervalSeconds = sql<number>`case
              when ${TrainingKnowledgeItem.strength} <= 0 then 259200
              when ${TrainingKnowledgeItem.strength} = 1 then 604800
              when ${TrainingKnowledgeItem.strength} = 2 then 1814400
              else 5184000 end`;
            const overdueRatio = sql<number>`extract(epoch from (${now.toISOString()}::timestamptz - ${anchor})) / ${intervalSeconds}`;
            const [candidate] = await transaction
              .select({
                knowledgeItemId: TrainingKnowledgeItem.id,
                label: TrainingKnowledgeItem.label,
                content: TrainingKnowledgeItem.content,
                question: TrainingKnowledgeQuestion.question,
                evidenceNodeId: TrainingKnowledgeItem.evidenceNodeId,
                strength: TrainingKnowledgeItem.strength,
                buildContent: TrainingUnitContent.buildContent,
                unitContextJson: TrainingUnitContent.unitContextJson,
              })
              .from(TrainingKnowledgeItem)
              .innerJoin(
                TrainingKnowledgeQuestion,
                eq(
                  TrainingKnowledgeQuestion.id,
                  TrainingKnowledgeItem.questionId,
                ),
              )
              .innerJoin(
                TrainingCurriculumNode,
                eq(
                  TrainingCurriculumNode.id,
                  TrainingKnowledgeQuestion.skillNodeId,
                ),
              )
              .innerJoin(
                TrainingUnitContent,
                eq(
                  TrainingUnitContent.nodeId,
                  TrainingKnowledgeItem.evidenceNodeId,
                ),
              )
              .where(
                and(
                  eq(TrainingCurriculumNode.planId, planId),
                  eq(TrainingKnowledgeItem.status, "checked"),
                  isNotNull(TrainingKnowledgeItem.checkedAt),
                  isNotNull(TrainingKnowledgeItem.evidenceNodeId),
                  sql`${overdueRatio} >= 1`,
                ),
              )
              .orderBy(desc(overdueRatio), asc(TrainingKnowledgeItem.id))
              .limit(1);
            if (!candidate?.evidenceNodeId) return null;
            const context = UnitContextSchema.safeParse(
              candidate.unitContextJson,
            );
            if (!context.success) return null;
            const criteria = context.data.judgment.criteria
              .filter((criterion) =>
                criterion.skills.includes(candidate.question),
              )
              .map((criterion) => ({
                id: criterion.id,
                description: criterion.criterion,
              }));
            if (criteria.length === 0) return null;
            const teachingContext = JSON.stringify({
              performance: context.data.performance,
              workflow: context.data.workflow,
              expertise: context.data.expertise,
              source: candidate.buildContent,
            }).slice(0, 12_000);
            const knowledgeSnapshot = RecallKnowledgeSnapshotSchema.parse({
              label: candidate.label,
              content: candidate.content,
              teachingContext,
              criteria,
            });
            const [created] = await transaction
              .insert(TrainingRecallTask)
              .values({
                userId,
                sessionId,
                planId,
                knowledgeItemId: candidate.knowledgeItemId,
                originalTeachingUnitNodeId: candidate.evidenceNodeId,
                strengthAtReservation: candidate.strength,
                knowledgeSnapshotJson: knowledgeSnapshot,
                preparationLeaseId: leaseId,
                preparationLeaseExpiresAt: leaseExpiry(
                  now,
                  PREPARATION_LEASE_MS,
                ),
              })
              .returning();
            if (!created) return null;
            return {
              task: mapTask(created),
              preparationLeaseId: leaseId,
              previousChallenges: await previousChallenges(
                transaction,
                candidate.knowledgeItemId,
              ),
            };
          }),
        ),

      savePreparedScenario: ({ taskId, leaseId, scenario, interactionId }) =>
        query("savePreparedRecallScenario", async (database) => {
          const [saved] = await database
            .update(TrainingRecallTask)
            .set({
              scenarioJson: scenario,
              state: transitionRecallTask("preparing", {
                type: "scenario_saved",
              }),
              interactionId,
              currentQuestion: scenario.challenge,
              preparationLeaseId: null,
              preparationLeaseExpiresAt: null,
            })
            .where(
              and(
                eq(TrainingRecallTask.id, taskId),
                eq(TrainingRecallTask.state, "preparing"),
                eq(TrainingRecallTask.preparationLeaseId, leaseId),
                sql`${TrainingRecallTask.preparationLeaseExpiresAt} > clock_timestamp()`,
                activePlanForTask,
              ),
            )
            .returning({ id: TrainingRecallTask.id });
          return Boolean(saved);
        }),

      getActiveTask: ({ userId, sessionId, planId, boundaryNodeId }) =>
        query("getActiveRecallTask", async (database) => {
          const task = await database.query.TrainingRecallTask.findFirst({
            where: and(
              eq(TrainingRecallTask.userId, userId),
                activePlanForTask,
              eq(TrainingRecallTask.sessionId, sessionId),
              eq(TrainingRecallTask.planId, planId),
              ne(TrainingRecallTask.state, "complete"),
              boundaryNodeId
                ? or(
                    sql`${TrainingRecallTask.pausedAt} is null`,
                    ne(
                      TrainingRecallTask.lastOfferedBoundaryNodeId,
                      boundaryNodeId,
                    ),
                    sql`${TrainingRecallTask.lastOfferedBoundaryNodeId} is null`,
                  )
                : undefined,
            ),
            orderBy: [asc(TrainingRecallTask.createdAt)],
          });
          return task ? mapTask(task) : null;
        }),

      startTask: ({ userId, taskId, boundaryNodeId }) =>
        Effect.gen(function* () {
          const task = yield* query("getRecallTaskForStart", (database) =>
            database.query.TrainingRecallTask.findFirst({
              where: and(
                eq(TrainingRecallTask.id, taskId),
                eq(TrainingRecallTask.userId, userId),
                activePlanForTask,
              ),
            }),
          );
          if (!task) {
            return yield* new RecallNotFoundError({
              message: "This recall check could not be found.",
            });
          }
          if (
            task.state !== "ready" &&
            task.state !== "retrieving" &&
            task.state !== "correcting"
          ) {
            return yield* new RecallConflictError({
              message: "This recall check cannot be started now.",
            });
          }
          const nextState =
            task.state === "ready"
              ? transitionRecallTask("ready", { type: "started" })
              : task.state;
          const [updated] = yield* query("startRecallTask", (database) =>
            database
              .update(TrainingRecallTask)
              .set({
                state: nextState,
                pausedAt: null,
                lastOfferedBoundaryNodeId: boundaryNodeId,
              })
              .where(
                and(
                  eq(TrainingRecallTask.id, task.id),
                  eq(TrainingRecallTask.state, task.state),
                  activePlanForTask,
                ),
              )
              .returning(),
          );
          if (!updated) {
            return yield* new RecallConflictError({
              message: "This recall check changed in another tab.",
            });
          }
          return mapTask(updated);
        }),

      pauseTask: ({ userId, taskId, now }) =>
        Effect.gen(function* () {
          const [updated] = yield* query("pauseRecallTask", (database) =>
            database
              .update(TrainingRecallTask)
              .set({ pausedAt: now, turnLeaseId: null, turnLeaseExpiresAt: null })
              .where(
                and(
                  eq(TrainingRecallTask.id, taskId),
                  eq(TrainingRecallTask.userId, userId),
                activePlanForTask,
                  sql`${TrainingRecallTask.state} in ('retrieving', 'correcting')`,
                  or(
                    sql`${TrainingRecallTask.turnLeaseId} is null`,
                    lte(TrainingRecallTask.turnLeaseExpiresAt, now),
                  ),
                ),
              )
              .returning(),
          );
          if (updated) return mapTask(updated);
          const exists = yield* query("getRecallTaskAfterPause", (database) =>
            database.query.TrainingRecallTask.findFirst({
              where: and(
                eq(TrainingRecallTask.id, taskId),
                eq(TrainingRecallTask.userId, userId),
                activePlanForTask,
              ),
            }),
          );
          return yield* exists
            ? new RecallConflictError({
                message: "This recall check cannot be paused now.",
              })
            : new RecallNotFoundError({
                message: "This recall check could not be found.",
              });
        }),

      deferTask: ({ userId, taskId, boundaryNodeId, now }) =>
        Effect.gen(function* () {
          const [updated] = yield* query("deferRecallTask", (database) =>
            database
              .update(TrainingRecallTask)
              .set({
                pausedAt: now,
                lastOfferedBoundaryNodeId: boundaryNodeId,
              })
              .where(
                and(
                  eq(TrainingRecallTask.id, taskId),
                  eq(TrainingRecallTask.userId, userId),
                activePlanForTask,
                  or(
                    eq(TrainingRecallTask.state, "ready"),
                    isNotNull(TrainingRecallTask.pausedAt),
                  ),
                  ne(TrainingRecallTask.state, "complete"),
                  ne(TrainingRecallTask.state, "preparing"),
                ),
              )
              .returning(),
          );
          if (updated) return mapTask(updated);
          const exists = yield* query("getRecallTaskAfterDefer", (database) =>
            database.query.TrainingRecallTask.findFirst({
              where: and(
                eq(TrainingRecallTask.id, taskId),
                eq(TrainingRecallTask.userId, userId),
                activePlanForTask,
              ),
            }),
          );
          return yield* exists
            ? new RecallConflictError({
                message: "This recall check cannot be deferred now.",
              })
            : new RecallNotFoundError({
                message: "This recall check could not be found.",
              });
        }),

      claimAnswer: (input) =>
        domainQuery("claimRecallAnswer", (database) =>
          database.transaction(async (tx) => {
            const transaction = tx as unknown as DatabaseClient;
            await transaction.execute(
              sql`select pg_advisory_xact_lock(hashtext(${input.taskId}))`,
            );
            const task = await transaction.query.TrainingRecallTask.findFirst({
              where: and(
                eq(TrainingRecallTask.id, input.taskId),
                eq(TrainingRecallTask.userId, input.userId),
                  activePlanForTask,
              ),
            });
            if (!task) {
              throw new RecallNotFoundError({
                message: "This recall check could not be found.",
              });
            }
            const byRequest =
              await transaction.query.TrainingRecallSubmission.findFirst({
                where: and(
                  eq(TrainingRecallSubmission.taskId, input.taskId),
                  eq(TrainingRecallSubmission.requestId, input.requestId),
                ),
              });
            if (byRequest && (
              byRequest.answer !== input.answer ||
              byRequest.interactionId !== input.interactionId
            )) {
              throw new RecallConflictError({
                message:
                  "A recall request id cannot be reused for another answer.",
              });
            }
            if (byRequest?.status === "committed" && byRequest.responseJson) {
              return {
                status: "committed" as const,
                response: byRequest.responseJson,
              };
            }
            if (
              task.interactionId !== input.interactionId ||
              (task.state !== "retrieving" && task.state !== "correcting") ||
              task.pausedAt
            ) {
              throw new RecallConflictError({
                message: "This recall answer belongs to a stale interaction.",
              });
            }
            const existing =
              byRequest ??
              (await transaction.query.TrainingRecallSubmission.findFirst({
                where: and(
                  eq(TrainingRecallSubmission.taskId, input.taskId),
                  eq(
                    TrainingRecallSubmission.interactionId,
                    input.interactionId,
                  ),
                ),
              }));
            if (existing?.status === "committed" && existing.responseJson) {
              return {
                status: "committed" as const,
                response: existing.responseJson,
              };
            }
            if (
              existing?.status === "processing" &&
              existing.leaseExpiresAt &&
              existing.leaseExpiresAt > input.now
            ) {
              return { status: "processing" as const };
            }
            if (existing) {
              await transaction
                .update(TrainingRecallSubmission)
                .set({
                  requestId: input.requestId,
                  answer: input.answer,
                  status: "processing",
                  leaseId: input.leaseId,
                  leaseExpiresAt: leaseExpiry(input.now, TURN_LEASE_MS),
                  responseJson: null,
                })
                .where(eq(TrainingRecallSubmission.id, existing.id));
            } else {
              await transaction.insert(TrainingRecallSubmission).values({
                taskId: input.taskId,
                requestId: input.requestId,
                interactionId: input.interactionId,
                answer: input.answer,
                leaseId: input.leaseId,
                leaseExpiresAt: leaseExpiry(input.now, TURN_LEASE_MS),
              });
            }
            const [claimedTask] = await transaction
              .update(TrainingRecallTask)
              .set({
                turnLeaseId: input.leaseId,
                turnLeaseExpiresAt: leaseExpiry(input.now, TURN_LEASE_MS),
              })
              .where(
                and(
                  eq(TrainingRecallTask.id, input.taskId),
                  eq(TrainingRecallTask.interactionId, input.interactionId),
                  activePlanForTask,
                  or(
                    sql`${TrainingRecallTask.turnLeaseId} is null`,
                    lte(TrainingRecallTask.turnLeaseExpiresAt, input.now),
                    eq(TrainingRecallTask.turnLeaseId, input.leaseId),
                  ),
                ),
              )
              .returning();
            if (!claimedTask) {
              throw new RecallConflictError({
                message: "This recall check changed in another tab.",
              });
            }
            return { status: "claimed" as const, task: mapTask(claimedTask) };
          }),
        ),

      commitAnswer: (input) =>
        domainQuery("commitRecallAnswer", (database) =>
          database.transaction(async (tx) => {
            const transaction = tx as unknown as DatabaseClient;
            await transaction.execute(
              sql`select pg_advisory_xact_lock(hashtext(${input.task.id}))`,
            );
            const currentTask =
              await transaction.query.TrainingRecallTask.findFirst({
                where: and(
                  eq(TrainingRecallTask.id, input.task.id),
                  eq(TrainingRecallTask.userId, input.userId),
                  activePlanForTask,
                ),
              });
            if (!currentTask) {
              throw new RecallNotFoundError({
                message: "This recall check could not be found.",
              });
            }
            const submission =
              await transaction.query.TrainingRecallSubmission.findFirst({
                where: and(
                  eq(TrainingRecallSubmission.taskId, input.task.id),
                  eq(TrainingRecallSubmission.requestId, input.requestId),
                ),
              });
            if (submission?.status === "committed" && submission.responseJson) {
              return submission.responseJson;
            }
            if (
              !submission ||
              submission.answer !== input.answer ||
              submission.leaseId !== input.leaseId
            ) {
              throw new RecallLeaseError({
                message: "This recall answer lease is no longer valid.",
              });
            }
            const [updatedTask] = await transaction
              .update(TrainingRecallTask)
              .set({
                state: input.nextState,
                interactionId: input.nextInteractionId,
                currentQuestion: input.currentQuestion,
                firstRetrievalJson: input.firstRetrieval,
                correctionHistoryJson: input.correctionHistory,
                pausedAt: null,
                turnLeaseId: null,
                turnLeaseExpiresAt: null,
                completedAt: input.nextState === "complete" ? input.now : null,
              })
              .where(
                and(
                  eq(TrainingRecallTask.id, input.task.id),
                  eq(TrainingRecallTask.userId, input.userId),
                  activePlanForTask,
                  eq(
                    TrainingRecallTask.interactionId,
                    submission.interactionId,
                  ),
                  eq(TrainingRecallTask.turnLeaseId, input.leaseId),
                  sql`${TrainingRecallTask.turnLeaseExpiresAt} > clock_timestamp()`,
                  eq(TrainingRecallTask.state, input.task.state),
                ),
              )
              .returning({ id: TrainingRecallTask.id });
            if (!updatedTask) {
              throw new RecallLeaseError({
                message: "This recall answer was replaced by another request.",
              });
            }
            if (input.schedule && input.task.knowledgeItemId) {
              const expectedStrength =
                input.schedule.kind === "correction_complete"
                  ? input.task.firstRetrieval?.strengthAfter
                  : input.task.strengthAtReservation;
              const updatedKnowledge = await transaction
                .update(TrainingKnowledgeItem)
                .set({
                  strength: input.schedule.strength,
                  lastReinforcedAt: input.schedule.lastReinforcedAt,
                  reviewDueAt: input.schedule.reviewDueAt,
                })
                .where(
                  and(
                    eq(TrainingKnowledgeItem.id, input.task.knowledgeItemId),
                    expectedStrength === undefined
                      ? sql`false`
                      : eq(TrainingKnowledgeItem.strength, expectedStrength),
                  ),
                )
                .returning({ id: TrainingKnowledgeItem.id });
              if (updatedKnowledge.length === 0) {
                const sourceStillExists =
                  await transaction.query.TrainingKnowledgeItem.findFirst({
                    where: eq(
                      TrainingKnowledgeItem.id,
                      input.task.knowledgeItemId,
                    ),
                    columns: { id: true },
                  });
                if (sourceStillExists) {
                  throw new RecallConflictError({
                    message:
                      "This knowledge item changed while the recall answer was being saved.",
                  });
                }
              }
            }
            const [committed] = await transaction
              .update(TrainingRecallSubmission)
              .set({
                status: "committed",
                responseJson: input.response,
                leaseId: null,
                leaseExpiresAt: null,
              })
              .where(
                and(
                  eq(TrainingRecallSubmission.id, submission.id),
                  eq(TrainingRecallSubmission.leaseId, input.leaseId),
                  sql`${TrainingRecallSubmission.leaseExpiresAt} > clock_timestamp()`,
                ),
              )
              .returning({ response: TrainingRecallSubmission.responseJson });
            if (!committed?.response) {
              throw new RecallLeaseError({
                message: "This recall answer could not be committed.",
              });
            }
            return committed.response;
          }),
        ),

      releaseAnswer: ({ taskId, requestId, leaseId }) =>
        query("releaseRecallAnswer", (database) =>
          database.transaction(async (tx) => {
            const transaction = tx as unknown as DatabaseClient;
            await Promise.all([
              transaction
                .update(TrainingRecallSubmission)
                .set({
                  status: "failed",
                  leaseId: null,
                  leaseExpiresAt: null,
                })
                .where(
                  and(
                    eq(TrainingRecallSubmission.taskId, taskId),
                    eq(TrainingRecallSubmission.requestId, requestId),
                    eq(TrainingRecallSubmission.leaseId, leaseId),
                  ),
                ),
              transaction
                .update(TrainingRecallTask)
                .set({ turnLeaseId: null, turnLeaseExpiresAt: null })
                .where(
                  and(
                    eq(TrainingRecallTask.id, taskId),
                    eq(TrainingRecallTask.turnLeaseId, leaseId),
                  ),
                ),
            ]);
          }),
        ),
    };
  }),
);
