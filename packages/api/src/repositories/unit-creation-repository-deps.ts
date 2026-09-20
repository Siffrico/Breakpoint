import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, asc, desc, eq, gt, ne } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingIdentityProfileVersion,
} from "@acme/db/schema";

import type {
  MasteryProgressionState,
  ProgressionNode,
} from "../domain/training/engine/plan-progression";
import type { JobRatingState } from "../domain/training/engine/rating";
import type { CreateNextUnitDependencies } from "../domain/training/unit-creation/create-next-unit";
import type { NodeBuildLeaseGuard } from "./node-build-lifecycle";
import { resolveProgressionModel } from "../domain/training/engine/progression-model";
import { createInitialRatingState } from "../domain/training/engine/rating";
import { isArtifactBuildError } from "../domain/training/orchestration/agent-runtime";
import { compileOutcome } from "../domain/training/outcome-curriculum/outcome-compiler";
import {
  ensureOutcomeCurriculumWorkflow,
  OutcomeCompilationError,
  OutcomePersistenceError,
} from "../domain/training/outcome-curriculum/workflows/ensure-outcome-curriculum";
import { advanceSkillMapNodeWorkflow } from "../domain/training/unit-creation/advance-skill-map-node";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import { prepareUnitContent } from "../domain/training/unit-preparation/prepare-unit-content";
import { queryWithClient } from "../effect/db";
import { resolvePlanSeedRating } from "./plan-seed-rating";
import { resolveClusterDirective } from "./resolve-cluster-directive";
import { withSkillKnowledgeBuildLock } from "./skill-knowledge-build-lock";
import { skillKnowledgeRepository } from "./skill-knowledge-repository";
import { trainingAttemptRepository } from "./training-attempt-repository";
import { appendDynamicUnitNode } from "./training-curriculum-node-writer";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { trainingRatingRepository } from "./training-rating-repository";
import { createUnitPreparationRepositoryDeps } from "./unit-preparation-repository-deps";

type Database = typeof databaseClient;
type NodeRow = typeof TrainingCurriculumNode.$inferSelect;

/**
 * The outcome the learner reaches after this one, or null when there is none.
 *
 * Ordered by orderIndex rather than by status so an interleaved plan (where
 * every outcome is unlocked at build time) warms them in the order they were
 * authored. Already-blueprinted successors are skipped here rather than inside
 * ensureOutcomeCurriculum, so the common steady-state case costs one indexed read
 * and no lock at all.
 */
export const findNextPlannedOutcome = async ({
  db,
  outcomeNodeId,
}: {
  db: Database;
  outcomeNodeId: string;
}): Promise<string | null> => {
  const current = await db.query.TrainingCurriculumNode.findFirst({
    where: eq(TrainingCurriculumNode.id, outcomeNodeId),
  });
  if (current?.kind !== "outcome") return null;
  const next = await db.query.TrainingCurriculumNode.findFirst({
    where: and(
      eq(TrainingCurriculumNode.planId, current.planId),
      eq(TrainingCurriculumNode.kind, "outcome"),
      gt(TrainingCurriculumNode.orderIndex, current.orderIndex),
    ),
    orderBy: asc(TrainingCurriculumNode.orderIndex),
  });
  if (!next || next.practiceContract) return null;
  return next.id;
};

/**
 * What this learner has actually done so far, for pass B to aim at.
 *
 * Capped because it rides a prompt: the newest attempts carry the failure
 * pattern worth designing against, and an unbounded history would grow the
 * blueprint call without improving it.
 */
const PRIOR_PERFORMANCE_LIMIT = 12;

const listRecentPriorPerformance = async ({
  db,
  sessionId,
}: {
  db: Database;
  sessionId: string;
}) =>
  (
    await trainingAttemptRepository.listAttemptHistory({
      db,
      sessionId,
      limit: PRIOR_PERFORMANCE_LIMIT,
    })
  ).map((attempt) => ({
    title: attempt.title,
    checksMet: attempt.checksMet,
    checksTotal: attempt.checksTotal,
    failureTags: attempt.failureTags,
  }));

export const ensureOutcomeCurriculum = async ({
  db,
  outcomeNodeId,
  targetIdentity,
  abortSignal,
}: {
  db: Database;
  outcomeNodeId: string;
  targetIdentity?: string;
  abortSignal?: AbortSignal;
}) =>
  withSkillKnowledgeBuildLock({
    db,
    skillNodeId: outcomeNodeId,
    loadReady: async (readyDb) => {
      try {
        const knowledge = await skillKnowledgeRepository.listKnowledge({
          db: readyDb,
          skillNodeId: outcomeNodeId,
        });
        if (knowledge.length > 0) return knowledge;
        throw new OutcomePersistenceError({
          operation: "loadReadyCurriculum",
          message: "The saved outcome curriculum is incomplete.",
        });
      } catch (cause) {
        if (cause instanceof OutcomePersistenceError) throw cause;
        throw new OutcomePersistenceError({
          operation: "loadReadyCurriculum",
          message: "The outcome curriculum database request failed.",
          cause,
        });
      }
    },
    build: (lockDb, withLease) => {
      const persistence = <A>(operation: string, run: () => Promise<A>) =>
        Effect.tryPromise({
          try: run,
          catch: (cause) =>
            new OutcomePersistenceError({
              operation,
              message: "The outcome curriculum database request failed.",
              cause,
            }),
        });

      // The node lease is the execution boundary for this Effect workflow.
      // eslint-disable-next-line no-restricted-syntax
      return Effect.runPromise(
        ensureOutcomeCurriculumWorkflow({
          outcomeNodeId,
          targetIdentity,
          abortSignal,
          deps: {
            loadOutcome: (nodeId) =>
              persistence("loadOutcome", () =>
                trainingCurriculumRepository.getNodeById({
                  db: lockDb,
                  nodeId,
                }),
              ),
            listKnowledge: (nodeId) =>
              persistence("listOutcomeKnowledge", () =>
                skillKnowledgeRepository.listKnowledge({
                  db: lockDb,
                  skillNodeId: nodeId,
                }),
              ),
            loadPlan: (planId) =>
              persistence("loadOutcomePlan", () =>
                lockDb.query.TrainingCurriculumPlan.findFirst({
                  where: eq(TrainingCurriculumPlan.id, planId),
                }),
              ).pipe(Effect.map((plan) => plan ?? null)),
            loadProfile: (profileVersionId) =>
              persistence("loadOutcomeProfile", () =>
                lockDb.query.TrainingIdentityProfileVersion.findFirst({
                  where: eq(
                    TrainingIdentityProfileVersion.id,
                    profileVersionId,
                  ),
                }),
              ).pipe(Effect.map((profile) => profile ?? null)),
            listPriorPerformance: (sessionId) =>
              persistence("listRecentPriorPerformance", () =>
                listRecentPriorPerformance({ db: lockDb, sessionId }),
              ),
            compile: (input) =>
              Effect.tryPromise({
                try: () => compileOutcome(input),
                catch: (cause) =>
                  new OutcomeCompilationError({
                    kind: isArtifactBuildError(cause)
                      ? cause.failureKind
                      : "provider",
                    message: "The outcome curriculum could not be compiled.",
                    cause,
                  }),
              }),
            persist: (input) =>
              persistence("persistOutcomeCurriculum", () =>
                withLease((leaseDb) =>
                  skillKnowledgeRepository.ensureOutcomeCurriculum({
                    db: leaseDb,
                    ...input,
                  }),
                ),
              ).pipe(
                Effect.flatMap((knowledge) =>
                  knowledge
                    ? Effect.succeed(knowledge)
                    : Effect.fail(
                        new OutcomePersistenceError({
                          operation: "persistOutcomeCurriculum",
                          message: "The outcome curriculum could not be saved.",
                        }),
                      ),
                ),
              ),
          },
        }),
      );
    },
  });

export const createUnitCreationRepositoryDeps = ({
  db,
  sessionId,
  userId,
  withLease,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  withLease?: NodeBuildLeaseGuard;
}): CreateNextUnitDependencies<NodeRow> => {
  // One seed lookup per node, cached for the life of this deps factory, so a
  // multi-touch unit creation pays for at most one extra query. Fail-closed: a null seed
  const seedCache = new Map<string, Promise<JobRatingState | null>>();
  const getSeed = (nodeId: string) => {
    const cached = seedCache.get(nodeId);
    if (cached) return cached;
    const pending = resolvePlanSeedRating({ db, nodeId });
    seedCache.set(nodeId, pending);
    return pending;
  };

  return {
    ensureSkillKnowledge: (skillNodeId) =>
      queryWithClient(db, "ensureOutcomeCurriculum", () =>
        ensureOutcomeCurriculum({ db, outcomeNodeId: skillNodeId }),
      ),
    loadOpenUnit: (skillNodeId, unitStatus, excludeUnitNodeId) =>
      queryWithClient(
        db,
        "loadOpenUnitForUnitCreation",
        async () =>
          (await db.query.TrainingCurriculumNode.findFirst({
            where: and(
              eq(TrainingCurriculumNode.parentNodeId, skillNodeId),
              eq(TrainingCurriculumNode.kind, "unit"),
              eq(TrainingCurriculumNode.status, unitStatus),
              excludeUnitNodeId
                ? ne(TrainingCurriculumNode.id, excludeUnitNodeId)
                : undefined,
            ),
            orderBy: [desc(TrainingCurriculumNode.orderIndex)],
          })) ?? null,
      ),
    loadSkill: (skillNodeId, unitStatus, excludeUnitNodeId) =>
      queryWithClient(db, "loadSkillForUnitCreation", async () => {
        const node = await db.query.TrainingCurriculumNode.findFirst({
          where: eq(TrainingCurriculumNode.id, skillNodeId),
        });
        if (!node?.skillMap) return null;
        if (node.kind !== "outcome") return null;
        const toFrontierItem = (item: {
          id: string;
          questionId: string;
          question: string;
          questionOrderIndex: number;
          practiceCount: number;
          kind: string;
          label: string;
          content: string;
          status: string;
          orderIndex: number;
        }) => ({
          id: item.id,
          questionId: item.questionId,
          question: item.question,
          questionOrderIndex: item.questionOrderIndex,
          practiceCount: item.practiceCount,
          kind: item.kind as "concept" | "mechanism",
          label: item.label,
          content: item.content,
          status: item.status,
          orderIndex: item.orderIndex,
        });

        const openUnit = await db.query.TrainingCurriculumNode.findFirst({
          where: and(
            eq(TrainingCurriculumNode.parentNodeId, skillNodeId),
            eq(TrainingCurriculumNode.kind, "unit"),
            eq(TrainingCurriculumNode.status, unitStatus),
            excludeUnitNodeId
              ? ne(TrainingCurriculumNode.id, excludeUnitNodeId)
              : undefined,
          ),
          orderBy: [desc(TrainingCurriculumNode.orderIndex)],
        });

        const entries = await skillKnowledgeRepository.listKnowledge({
          db,
          skillNodeId,
        });
        return {
          title: node.title,
          whyItMatters: node.whyItMatters,
          entries: entries.map(toFrontierItem),
          openUnit: openUnit ?? null,
        };
      }),
    resolveDirective: (skillNodeId) =>
      queryWithClient(db, "resolveUnitCreationDirective", async () =>
        resolveClusterDirective({
          db,
          userId,
          clusterNodeId: skillNodeId,
          seed: await getSeed(skillNodeId),
        }),
      ),
    appendUnit: (input) =>
      queryWithClient(db, "appendDynamicUnit", () =>
        withLease
          ? withLease((leaseDb) =>
              appendDynamicUnitNode({ db: leaseDb, ...input }),
            )
          : appendDynamicUnitNode({ db, ...input }),
      ),
    hasUnitContent: (nodeId) =>
      queryWithClient(db, "hasDynamicUnitContent", async () =>
        Boolean(
          await trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
        ),
      ),
    prepareUnitEffect: (node) =>
      prepareUnitContent({
        node,
        sessionId,
        deps: createUnitPreparationRepositoryDeps(db),
      }).pipe(Effect.asVoid),
  };
};

/**
 * Load the progression state for a unit's skillMap-bearing parent. The regime
 * is decided once by {@link resolveProgressionModel}; this only gathers the
 * evidence that regime needs. Returns null when the outcome is not compiled.
 */
export const loadProgressionState = async ({
  db,
  skillNodeId,
  userId,
}: {
  db: Database;
  skillNodeId: string;
  userId: string;
  includeUnitNodeId?: string;
}): Promise<MasteryProgressionState | null> => {
  const node = await db.query.TrainingCurriculumNode.findFirst({
    where: eq(TrainingCurriculumNode.id, skillNodeId),
  });
  const model = node ? resolveProgressionModel(node) : null;
  if (!model) return null;

  const [seed, skillItems] = await Promise.all([
    resolvePlanSeedRating({ db, nodeId: skillNodeId }),
    skillKnowledgeRepository.listKnowledge({ db, skillNodeId }),
  ]);
  const progress = await trainingRatingRepository.loadJobProgress({
    db,
    userId,
    nodeId: skillNodeId,
    initialRatingState: seed ?? createInitialRatingState(),
  });
  const skills = [
    ...new Map(skillItems.map((item) => [item.questionId, item])).values(),
  ];
  return {
    regime: "main_outcome",
    unpracticedSkillCount:
      skills.length === 0
        ? 1
        : skills.filter((skill) => skill.practiceCount === 0).length,
    skillCount: skills.length,
    learnerRating: progress.ratingState.rating,
    ratingDeviation: progress.ratingState.ratingDeviation,
    masteryRating: model.mastery.masteryRating,
    maxRatingDeviation: model.mastery.maxRatingDeviation,
  };
};

/**
 * Repository adapter for {@link advanceSkillMapNodeWorkflow}: the domain
 * workflow owns the orchestration (plan the advancement, persist it, ensure
 * the next unit); this only supplies the data ports. The status set commits
 * in one transaction so a failure can never complete the mastered node while
 * leaving its successor locked.
 */
export const advanceSkillMapNode = async ({
  db,
  nodeId,
  sessionId,
  userId,
}: {
  db: Database;
  nodeId: string;
  sessionId: string;
  userId: string;
}) =>
  Effect.runPromise(
    advanceSkillMapNodeWorkflow({
      nodeId,
      deps: {
        loadPlanNodes: (masteredNodeId) =>
          queryWithClient(db, "loadPlanNodesForAdvancement", async () => {
            const node = await db.query.TrainingCurriculumNode.findFirst({
              where: eq(TrainingCurriculumNode.id, masteredNodeId),
            });
            if (!node) return null;
            const planNodes = await db.query.TrainingCurriculumNode.findMany({
              where: eq(TrainingCurriculumNode.planId, node.planId),
            });
            return planNodes.map((row) => ({
              id: row.id,
              parentNodeId: row.parentNodeId,
              kind: row.kind as ProgressionNode["kind"],
              status: row.status as ProgressionNode["status"],
              orderIndex: row.orderIndex,
            }));
          }),
        applyAdvancement: ({ changes }) =>
          queryWithClient(db, "applyAdvancementChanges", () =>
            db.transaction(async (tx) => {
              const transactionDb = tx as unknown as Database;
              for (const change of changes) {
                await transactionDb
                  .update(TrainingCurriculumNode)
                  .set({ status: change.status })
                  .where(eq(TrainingCurriculumNode.id, change.nodeId));
              }
            }),
          ),
        createNextUnit: (parentNodeId) =>
          createNextUnit({
            skillNodeId: parentNodeId,
            deps: createUnitCreationRepositoryDeps({ db, sessionId, userId }),
          }),
      },
    }),
  );
