import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, desc, eq, ne } from "@acme/db";
import { TrainingCurriculumNode, TrainingCurriculumPlan } from "@acme/db/schema";

import type { CreateNextUnitDependencies } from "../domain/training/unit-creation/create-next-unit";
import type {
  MasteryProgressionState,
  ProgressionNode,
} from "../domain/training/engine/plan-progression";
import { CONCEPT_COVERAGE_TARGET } from "../domain/training/engine/concept-coverage";
import {
  difficultyRampOf,
  resolveProgressionModel,
} from "../domain/training/engine/progression-model";
import { advanceSkillMapNodeWorkflow } from "../domain/training/unit-creation/advance-skill-map-node";
import {
  createInitialRatingState,
  expandSkillBands,
} from "../domain/training/engine/rating";
import type { JobRatingState } from "../domain/training/engine/rating";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import { designSyllabus } from "../domain/training/agents/syllabus-designer";
import { resolveScenarioDirective } from "../domain/training/orchestration/goldilocks";
import { prepareUnitContent } from "../domain/training/unit-preparation/prepare-unit-content";
import { queryWithClient } from "../effect/db";
import { resolvePlanSeedRating } from "./plan-seed-rating";
import { appendDynamicUnitNode } from "./training-curriculum-node-writer";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { createTrainingRatingGoldilocksDeps } from "./training-rating-goldilocks-deps";
import { trainingRatingRepository } from "./training-rating-repository";
import { trainingSyllabusRepository } from "./training-syllabus-repository";
import { createUnitPreparationRepositoryDeps } from "./unit-preparation-repository-deps";

type Database = typeof databaseClient;
type NodeRow = typeof TrainingCurriculumNode.$inferSelect;

export const ensureSkillSyllabus = async ({
  db,
  clusterNodeId,
  targetIdentity,
}: {
  db: Database;
  clusterNodeId: string;
  targetIdentity: string;
}) => {
  const cluster = await trainingCurriculumRepository.getNodeById({
    db,
    nodeId: clusterNodeId,
  });
  if (!cluster?.skillMap) return null;
  const existing = await trainingSyllabusRepository.listEntries({
    db,
    clusterNodeId,
  });
  if (existing.length > 0) return existing;
  const syllabus = await designSyllabus({
    title: cluster.title,
    summary: cluster.summary,
    targetIdentity,
    workflow: cluster.skillMap.workflow,
    masteryContract: cluster.skillMap.masteryContract,
  });
  return trainingSyllabusRepository.ensureSyllabus({
    db,
    clusterNodeId,
    entries: syllabus.entries,
  });
};

export const createUnitCreationRepositoryDeps = ({
  db,
  sessionId,
  userId,
}: {
  db: Database;
  sessionId: string;
  userId: string;
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
  loadSkill: (clusterNodeId) =>
    queryWithClient(db, "loadSkillForUnitCreation", async () => {
      const node = await db.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, clusterNodeId),
      });
      if (!node?.skillMap) return null;
      const mapEntry = (entry: {
        id: string;
        label: string;
        gloss: string;
        kind: string;
        status: string;
      }) => ({
        id: entry.id,
        label: entry.label,
        gloss: entry.gloss,
        kind: entry.kind as
          | "discrimination"
          | "concept"
          | "subskill"
          | "vocabulary",
        status: entry.status,
      });

      const openUnit = await db.query.TrainingCurriculumNode.findFirst({
        where: and(
          eq(TrainingCurriculumNode.parentNodeId, clusterNodeId),
          eq(TrainingCurriculumNode.kind, "unit"),
          ne(TrainingCurriculumNode.status, "completed"),
        ),
        orderBy: [desc(TrainingCurriculumNode.orderIndex)],
      });

      // Skillset units (parent = ability): the "frontier" is the ability's
      // weakest concepts across ALL its skills — the least-covered ones are
      // the integration targets. They are surfaced with status "unchecked" so
      // the pure selector (sliceSyllabusFrontier) picks them; their real
      // check-off state lives on the skill's own foundation history.
      if (node.kind === "ability" || node.kind === "skill") {
        if (node.kind === "ability") {
          const skills = await db.query.TrainingCurriculumNode.findMany({
            where: and(
              eq(TrainingCurriculumNode.parentNodeId, clusterNodeId),
              eq(TrainingCurriculumNode.kind, "skill"),
            ),
          });
          const perSkillEntries = await Promise.all(
            skills.map((skill) =>
              trainingSyllabusRepository.listEntries({
                db,
                clusterNodeId: skill.id,
              }),
            ),
          );
          const entries = perSkillEntries
            .flat()
            .sort((a, b) => a.coverageCount - b.coverageCount)
            .map((entry) => ({ ...mapEntry(entry), status: "unchecked" }));
          return {
            title: node.title,
            whyItMatters: node.whyItMatters,
            entries,
            openUnit: openUnit ?? null,
          };
        }
        let entries = await trainingSyllabusRepository.listEntries({
          db,
          clusterNodeId,
        });
        if (entries.length === 0) {
          const plan = await db.query.TrainingCurriculumPlan.findFirst({
            where: eq(TrainingCurriculumPlan.id, node.planId),
          });
          if (!plan) return null;
          entries =
            (await ensureSkillSyllabus({
              db,
              clusterNodeId,
              targetIdentity: plan.targetIdentity,
            })) ?? [];
        }
        return {
          title: node.title,
          whyItMatters: node.whyItMatters,
          entries: entries.map(mapEntry),
          openUnit: openUnit ?? null,
        };
      }

      // Legacy skill_cluster path — unchanged.
      const entries = await trainingSyllabusRepository.listEntries({
        db,
        clusterNodeId,
      });
      return {
        title: node.title,
        whyItMatters: node.whyItMatters,
        entries: entries.map(mapEntry),
        openUnit: openUnit ?? null,
      };
    }),
  resolveDirective: (clusterNodeId) =>
    queryWithClient(db, "resolveUnitCreationDirective", async () => {
      const cluster = await db.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, clusterNodeId),
      });
      const model = cluster ? resolveProgressionModel(cluster) : null;
      if (!model) throw new Error("Skill map is missing.");
      return resolveScenarioDirective({
        userId,
        nodeId: clusterNodeId,
        now: new Date(),
        bands:
          cluster?.difficultyBands ?? expandSkillBands(difficultyRampOf(model)),
        initialRatingState: (await getSeed(clusterNodeId)) ?? undefined,
        deps: createTrainingRatingGoldilocksDeps(db),
      });
    }),
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
      deps: createUnitPreparationRepositoryDeps(db),
    }).pipe(Effect.asVoid),
  };
};

/**
 * Load the progression state for a unit's skillMap-bearing parent. The regime
 * is decided once by {@link resolveProgressionModel}; this only gathers the
 * evidence that regime needs. Returns null when the node runs no mastery loop
 * (legacy/imported plans) — callers treat null as "nothing to decide".
 */
export const loadProgressionState = async ({
  db,
  clusterNodeId,
  userId,
}: {
  db: Database;
  clusterNodeId: string;
  userId: string;
}): Promise<MasteryProgressionState | null> => {
  const node = await db.query.TrainingCurriculumNode.findFirst({
    where: eq(TrainingCurriculumNode.id, clusterNodeId),
  });
  const model = node ? resolveProgressionModel(node) : null;
  if (!model) return null;

  switch (model.regime) {
    case "foundation": {
      const entries = await trainingSyllabusRepository.listEntries({
        db,
        clusterNodeId,
      });
      return {
        regime: "foundation",
        entries: entries.map((entry) => ({
          coverageCount: entry.coverageCount,
        })),
        coverageTarget: CONCEPT_COVERAGE_TARGET,
      };
    }
    case "skillset": {
      const seed = await resolvePlanSeedRating({ db, nodeId: clusterNodeId });
      const [entries, progress] = await Promise.all([
        model.checksSyllabusFrontier
          ? trainingSyllabusRepository.listEntries({ db, clusterNodeId })
          : Promise.resolve([]),
        trainingRatingRepository.loadJobProgress({
          db,
          userId,
          nodeId: clusterNodeId,
          initialRatingState: seed ?? createInitialRatingState(),
        }),
      ]);
      return {
        regime: "skillset",
        uncheckedEntryCount: entries.filter(
          (entry) => entry.status !== "checked",
        ).length,
        learnerRating: progress.ratingState.rating,
        ratingDeviation: progress.ratingState.ratingDeviation,
        peakRating: model.mastery.peakRating,
        maxRatingDeviation: model.mastery.maxRatingDeviation,
      };
    }
  }
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
        applyAdvancement: ({ changes, stageChanges }) =>
          queryWithClient(db, "applyAdvancementChanges", () =>
            db.transaction(async (tx) => {
              const transactionDb = tx as unknown as Database;
              for (const change of changes) {
                await transactionDb
                  .update(TrainingCurriculumNode)
                  .set({ status: change.status })
                  .where(eq(TrainingCurriculumNode.id, change.nodeId));
              }
              for (const change of stageChanges) {
                await transactionDb
                  .update(TrainingCurriculumNode)
                  .set({ abilityStage: change.stage })
                  .where(eq(TrainingCurriculumNode.id, change.nodeId));
              }
            }),
          ),
        createNextUnit: (parentNodeId) =>
          createNextUnit({
            clusterNodeId: parentNodeId,
            deps: createUnitCreationRepositoryDeps({ db, sessionId, userId }),
          }),
      },
    }),
  );
