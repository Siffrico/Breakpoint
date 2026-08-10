import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, asc, desc, eq, gt } from "@acme/db";
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
import { SKILL_MAP_COVERAGE_TARGET } from "../domain/training/engine/concept-coverage";
import {
  regimeForNodeKind,
  resolveProgressionModel,
} from "../domain/training/engine/progression-model";
import {
  createInitialRatingState,
  deriveCanonicalDifficultyBands,
} from "../domain/training/engine/rating";
import { ARCHETYPE_FORMATS } from "../domain/training/engine/scenario-archetypes";
import { compileOutcome } from "../domain/training/outcome-curriculum/outcome-compiler";
import { advanceSkillMapNodeWorkflow } from "../domain/training/unit-creation/advance-skill-map-node";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import { createRegimeTargetSelector } from "../domain/training/unit-creation/target-selection";
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
  (await trainingAttemptRepository.listAttemptHistory({ db, sessionId }))
    .slice(-PRIOR_PERFORMANCE_LIMIT)
    .map((attempt) => ({
      title: attempt.title,
      score: attempt.score,
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
    loadReady: (readyDb) =>
      skillKnowledgeRepository.listKnowledge({
        db: readyDb,
        skillNodeId: outcomeNodeId,
      }),
    build: async (lockDb) => {
      const outcome = await trainingCurriculumRepository.getNodeById({
        db: lockDb,
        nodeId: outcomeNodeId,
      });
      if (outcome?.kind !== "outcome" || !outcome.outcomeResult) return null;
      const existing = await skillKnowledgeRepository.listKnowledge({
        db: lockDb,
        skillNodeId: outcomeNodeId,
      });
      if (outcome.skillMap && outcome.practiceContract && existing.length > 0) {
        return existing;
      }
      const plan = await lockDb.query.TrainingCurriculumPlan.findFirst({
        where: eq(TrainingCurriculumPlan.id, outcome.planId),
      });
      const identity = targetIdentity ?? plan?.targetIdentity;
      if (!plan || !identity) return null;
      const profile = plan.profileVersionId
        ? await lockDb.query.TrainingIdentityProfileVersion.findFirst({
            where: eq(TrainingIdentityProfileVersion.id, plan.profileVersionId),
          })
        : null;
      const compilation = await compileOutcome({
        targetIdentity: identity,
        projectTitle: plan.title,
        projectSummary: plan.summary,
        outcomeTitle: outcome.title,
        outcomeResult: outcome.outcomeResult,
        learnerContext: {
          currentGap:
            profile?.hardMoments[0] ??
            profile?.currentBaseline ??
            "No specific current gap was recorded.",
          goodMeans:
            profile?.behaviorSignals && profile.behaviorSignals.length > 0
              ? profile.behaviorSignals
              : ["Accurate, domain-authentic performance."],
        },
        priorPerformance: await listRecentPriorPerformance({
          db: lockDb,
          sessionId: plan.onboardingSessionId,
        }),
        options: { abortSignal },
      });
      const difficultyBands = [
        ...deriveCanonicalDifficultyBands(
          ARCHETYPE_FORMATS[compilation.practiceContract.responseMode],
        ),
      ];
      return skillKnowledgeRepository.ensureOutcomeCurriculum({
        db: lockDb,
        outcomeNodeId,
        skillMap: compilation.skillMap,
        practiceContract: compilation.practiceContract,
        difficultyBands,
      });
    },
  });

export const createUnitCreationRepositoryDeps = ({
  db,
  sessionId,
  userId,
  abortSignal,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  abortSignal?: AbortSignal;
}): CreateNextUnitDependencies<NodeRow> => {
  // One seed lookup per node, cached for the life of this deps factory, so a
  // multi-touch unit creation pays for at most one extra query. Fail-closed: a null seed
  // means the goldilocks engine uses its policy default.
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
    loadOpenUnit: (skillNodeId, unitStatus) =>
      queryWithClient(
        db,
        "loadOpenUnitForUnitCreation",
        async () =>
          (await db.query.TrainingCurriculumNode.findFirst({
            where: and(
              eq(TrainingCurriculumNode.parentNodeId, skillNodeId),
              eq(TrainingCurriculumNode.kind, "unit"),
              eq(TrainingCurriculumNode.status, unitStatus),
            ),
            orderBy: [desc(TrainingCurriculumNode.orderIndex)],
          })) ?? null,
      ),
    loadSkill: (skillNodeId, unitStatus) =>
      queryWithClient(db, "loadSkillForUnitCreation", async () => {
        const node = await db.query.TrainingCurriculumNode.findFirst({
          where: eq(TrainingCurriculumNode.id, skillNodeId),
        });
        if (!node?.skillMap) return null;
        const regime = regimeForNodeKind(node.kind);
        if (!regime) return null;
        const toFrontierItem = (item: {
          id: string;
          questionId: string;
          question: string;
          questionOrderIndex: number;
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
          ),
          orderBy: [desc(TrainingCurriculumNode.orderIndex)],
        });

        if (node.kind !== "outcome") return null;
        const entries = await skillKnowledgeRepository.listKnowledge({
          db,
          skillNodeId,
        });
        return {
          title: node.title,
          whyItMatters: node.whyItMatters,
          regime,
          entries: entries.map((entry) => ({
            ...toFrontierItem(entry),
            coverageCount: entry.coverageCount,
          })),
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
        appendDynamicUnitNode({ db, ...input }),
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
        abortSignal,
        deps: createUnitPreparationRepositoryDeps(db),
      }).pipe(Effect.asVoid),
    selectTargets: createRegimeTargetSelector(),
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
  return {
    regime: "main_outcome",
    skillItemsBelowCoverage:
      skillItems.length === 0
        ? 1
        : skillItems.filter(
            (entry) => entry.coverageCount < SKILL_MAP_COVERAGE_TARGET,
          ).length,
    skillItemsTotal: skillItems.length,
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
