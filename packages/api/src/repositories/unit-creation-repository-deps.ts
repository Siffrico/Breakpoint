import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, desc, eq, isNotNull } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
} from "@acme/db/schema";

import type {
  MasteryProgressionState,
  ProgressionNode,
} from "../domain/training/engine/plan-progression";
import type { JobRatingState } from "../domain/training/engine/rating";
import type { CreateNextUnitDependencies } from "../domain/training/unit-creation/create-next-unit";
import type { SkillPractice } from "../domain/training/unit-creation/target-selection";
import { designSkillKnowledge } from "../domain/training/agents/knowledge-mapper";
import { CONCEPT_COVERAGE_TARGET } from "../domain/training/engine/concept-coverage";
import {
  difficultyRampOf,
  regimeForNodeKind,
  resolveProgressionModel,
  resolveScenarioFormat,
} from "../domain/training/engine/progression-model";
import {
  createInitialRatingState,
  expandSkillBands,
} from "../domain/training/engine/rating";
import { resolveScenarioDirective } from "../domain/training/orchestration/goldilocks";
import { advanceSkillMapNodeWorkflow } from "../domain/training/unit-creation/advance-skill-map-node";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
import {
  countSkillsBelowRepTarget,
  createRegimeTargetSelector,
} from "../domain/training/unit-creation/target-selection";
import { prepareUnitContent } from "../domain/training/unit-preparation/prepare-unit-content";
import { queryWithClient } from "../effect/db";
import { resolvePlanSeedRating } from "./plan-seed-rating";
import { skillKnowledgeRepository } from "./skill-knowledge-repository";
import { appendDynamicUnitNode } from "./training-curriculum-node-writer";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { createTrainingRatingGoldilocksDeps } from "./training-rating-goldilocks-deps";
import { trainingRatingRepository } from "./training-rating-repository";
import { createUnitPreparationRepositoryDeps } from "./unit-preparation-repository-deps";

type Database = typeof databaseClient;
type NodeRow = typeof TrainingCurriculumNode.$inferSelect;

export const ensureSkillKnowledge = async ({
  db,
  skillNodeId,
  targetIdentity,
}: {
  db: Database;
  skillNodeId: string;
  targetIdentity: string;
}) => {
  const cluster = await trainingCurriculumRepository.getNodeById({
    db,
    nodeId: skillNodeId,
  });
  if (!cluster?.skillMap) return null;
  const existing = await skillKnowledgeRepository.listKnowledge({
    db,
    skillNodeId,
  });
  if (existing.length > 0) return existing;
  const knowledge = await designSkillKnowledge({
    title: cluster.title,
    summary: cluster.summary,
    targetIdentity,
    workflow: cluster.skillMap.workflow,
    masteryContract: cluster.skillMap.masteryContract,
  });
  return skillKnowledgeRepository.ensureKnowledge({
    db,
    skillNodeId,
    questions: knowledge.questions,
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

        // Skillset units (parent = ability): the "frontier" is the ability's
        // weakest concepts across ALL its skills — the least-covered ones are
        // the integration targets. They are surfaced with status "unchecked" so
        // the selector picks them; their real check-off state lives on the
        // skill's own foundation history. Each entry carries its owning skill
        // so the interleaving selector can rotate between skills across units.
        if (node.kind === "ability" || node.kind === "skill") {
          if (node.kind === "ability") {
            const skills = await db.query.TrainingCurriculumNode.findMany({
              where: and(
                eq(TrainingCurriculumNode.parentNodeId, skillNodeId),
                eq(TrainingCurriculumNode.kind, "skill"),
              ),
            });
            const perSkillEntries = await Promise.all(
              skills.map(async (skill) =>
                (
                  await skillKnowledgeRepository.listKnowledge({
                    db,
                    skillNodeId: skill.id,
                  })
                ).map((entry) => ({ ...entry, ownerSkillId: skill.id })),
              ),
            );
            const entries = perSkillEntries
              .flat()
              .sort((a, b) => a.coverageCount - b.coverageCount)
              .map((entry) => ({
                ...toFrontierItem(entry),
                ownerSkillId: entry.ownerSkillId,
                status: "unchecked",
              }));
            return {
              title: node.title,
              whyItMatters: node.whyItMatters,
              regime,
              entries,
              openUnit: openUnit ?? null,
            };
          }
          let entries = await skillKnowledgeRepository.listKnowledge({
            db,
            skillNodeId,
          });
          if (entries.length === 0) {
            const plan = await db.query.TrainingCurriculumPlan.findFirst({
              where: eq(TrainingCurriculumPlan.id, node.planId),
            });
            if (!plan) return null;
            // Locked skills skip the build-time prewarm, so this unlock-time
            // ensure is their first knowledge-map generation.
            entries =
              (await ensureSkillKnowledge({
                db,
                skillNodeId,
                targetIdentity: plan.targetIdentity,
              })) ?? [];
          }
          return {
            title: node.title,
            whyItMatters: node.whyItMatters,
            regime,
            entries: entries.map(toFrontierItem),
            openUnit: openUnit ?? null,
          };
        }
        return null;
      }),
    resolveDirective: (skillNodeId) =>
      queryWithClient(db, "resolveUnitCreationDirective", async () => {
        const cluster = await db.query.TrainingCurriculumNode.findFirst({
          where: eq(TrainingCurriculumNode.id, skillNodeId),
        });
        if (!cluster?.skillMap) throw new Error("Skill map is missing.");
        const model = resolveProgressionModel(cluster);
        if (!model) throw new Error("Skill map node is invalid.");
        return resolveScenarioDirective({
          userId,
          nodeId: skillNodeId,
          now: new Date(),
          bands:
            cluster.difficultyBands ??
            expandSkillBands(difficultyRampOf(model)),
          initialRatingState: (await getSeed(skillNodeId)) ?? undefined,
          scenarioFormat: resolveScenarioFormat(cluster.skillMap),
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
    selectTargets: createRegimeTargetSelector({
      skillPracticeHistory: ({ abilityNodeId }) =>
        queryWithClient(db, "loadSkillPracticeHistory", () =>
          loadSkillPracticeHistory({ db, abilityNodeId }),
        ),
    }),
  };
};

/**
 * Every child skill of an ability with the number of completed skillset units
 * that were a rep of it, and when the latest one landed.
 *
 * Reads both halves of Fix 2 from the same place: the round-robin picks the
 * minimum rep count, and the mastery gate counts how many skills are still
 * short of the target. Unpracticed skills are present at zero reps — the
 * round-robin's no-starvation guarantee depends on seeing the full roster, so
 * an inner join over practiced skills alone would break it.
 *
 * Grouped in memory rather than in SQL: an ability holds at most a few dozen
 * units, both predicates ride the parent index, and it keeps the timestamp
 * typed as a Date instead of whatever an aggregate hands back.
 */
export const loadSkillPracticeHistory = async ({
  db,
  abilityNodeId,
}: {
  db: Database;
  abilityNodeId: string;
}): Promise<SkillPractice[]> => {
  const [skills, completedUnits] = await Promise.all([
    db.query.TrainingCurriculumNode.findMany({
      where: and(
        eq(TrainingCurriculumNode.parentNodeId, abilityNodeId),
        eq(TrainingCurriculumNode.kind, "skill"),
      ),
      orderBy: [TrainingCurriculumNode.orderIndex],
      columns: { id: true },
    }),
    db.query.TrainingCurriculumNode.findMany({
      where: and(
        eq(TrainingCurriculumNode.parentNodeId, abilityNodeId),
        eq(TrainingCurriculumNode.kind, "unit"),
        eq(TrainingCurriculumNode.status, "completed"),
        isNotNull(TrainingCurriculumNode.practicedSkillNodeId),
      ),
      columns: { practicedSkillNodeId: true, createdAt: true },
    }),
  ]);

  const practiceBySkillId = new Map<string, SkillPractice>(
    skills.map((skill) => [
      skill.id,
      { skillId: skill.id, reps: 0, lastPracticedAt: null },
    ]),
  );
  for (const unit of completedUnits) {
    const practice = practiceBySkillId.get(unit.practicedSkillNodeId ?? "");
    // A unit whose skill has since been removed from the plan counts for
    // nothing rather than resurrecting a skill the roster no longer has.
    if (!practice) continue;
    practice.reps += 1;
    if (
      !practice.lastPracticedAt ||
      unit.createdAt > practice.lastPracticedAt
    ) {
      practice.lastPracticedAt = unit.createdAt;
    }
  }
  return [...practiceBySkillId.values()];
};

/**
 * Load the progression state for a unit's skillMap-bearing parent. The regime
 * is decided once by {@link resolveProgressionModel}; this only gathers the
 * evidence that regime needs. Returns null when the node runs no mastery loop
 * (legacy/imported plans) — callers treat null as "nothing to decide".
 */
export const loadProgressionState = async ({
  db,
  skillNodeId,
  userId,
}: {
  db: Database;
  skillNodeId: string;
  userId: string;
}): Promise<MasteryProgressionState | null> => {
  const node = await db.query.TrainingCurriculumNode.findFirst({
    where: eq(TrainingCurriculumNode.id, skillNodeId),
  });
  const model = node ? resolveProgressionModel(node) : null;
  if (!model) return null;

  switch (model.regime) {
    case "foundation": {
      const entries = await skillKnowledgeRepository.listKnowledge({
        db,
        skillNodeId,
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
      const [seed, practice] = await Promise.all([
        resolvePlanSeedRating({ db, nodeId: skillNodeId }),
        loadSkillPracticeHistory({ db, abilityNodeId: skillNodeId }),
      ]);
      const progress = await trainingRatingRepository.loadJobProgress({
        db,
        userId,
        nodeId: skillNodeId,
        initialRatingState: seed ?? createInitialRatingState(),
      });
      return {
        regime: "skillset",
        skillsBelowRepTarget: countSkillsBelowRepTarget(practice),
        learnerRating: progress.ratingState.rating,
        ratingDeviation: progress.ratingState.ratingDeviation,
        masteryRating: model.mastery.masteryRating,
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
            skillNodeId: parentNodeId,
            deps: createUnitCreationRepositoryDeps({ db, sessionId, userId }),
          }),
      },
    }),
  );
