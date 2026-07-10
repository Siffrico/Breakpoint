import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, desc, eq, ne } from "@acme/db";
import { TrainingCurriculumNode } from "@acme/db/schema";

import type { CreateNextUnitDependencies } from "../domain/training/unit-creation/create-next-unit";
import type {
  MasteryProgressionState,
  ProgressionNode,
} from "../domain/training/engine/plan-progression";
import { CONCEPT_COVERAGE_TARGET } from "../domain/training/engine/concept-coverage";
import { planSkillMapAdvancement } from "../domain/training/engine/plan-progression";
import {
  createInitialRatingState,
  expandSkillBands,
} from "../domain/training/engine/rating";
import type { JobRatingState } from "../domain/training/engine/rating";
import { createNextUnit } from "../domain/training/unit-creation/create-next-unit";
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
      if (!cluster?.skillMap) throw new Error("Skill map is missing.");
      return resolveScenarioDirective({
        userId,
        nodeId: clusterNodeId,
        now: new Date(),
        bands:
          cluster.difficultyBands ??
          expandSkillBands(cluster.skillMap.bandRamp),
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
 * Load the two-regime progression state for a unit's skillMap-bearing parent.
 * Returns null when the node has no skill map (legacy/imported plans) — those
 * plans never enter the mastery loop, so callers treat null as "nothing to
 * decide".
 *
 *   skill node          → foundation regime: concept coverage vs. the target
 *   ability node        → skillset regime: the ability ELO vs. its peak gate
 *   legacy skill_cluster → skillset regime + its old syllabus-frontier check
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
  if (!node?.skillMap) return null;

  if (node.kind === "skill") {
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

  const seed = await resolvePlanSeedRating({ db, nodeId: clusterNodeId });
  const [entries, progress] = await Promise.all([
    node.kind === "ability"
      ? Promise.resolve([])
      : trainingSyllabusRepository.listEntries({ db, clusterNodeId }),
    trainingRatingRepository.loadJobProgress({
      db,
      userId,
      nodeId: clusterNodeId,
      initialRatingState: seed ?? createInitialRatingState(),
    }),
  ]);
  return {
    regime: "skillset",
    uncheckedEntryCount: entries.filter((entry) => entry.status !== "checked")
      .length,
    learnerRating: progress.ratingState.rating,
    ratingDeviation: progress.ratingState.ratingDeviation,
    peakRating: node.skillMap.bandRamp.peakRating,
    maxRatingDeviation: node.skillMap.masteryContract.maxRatingDeviation ?? 80,
  };
};

/**
 * A skillMap node (skill or ability) is mastered: apply the pure advancement
 * plan (complete it, unlock what follows) and create the next unit it names.
 * Idempotent per node — re-running on an already-completed node re-applies the
 * same statuses and re-ensures the same next unit.
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
}) => {
  const node = await db.query.TrainingCurriculumNode.findFirst({
    where: eq(TrainingCurriculumNode.id, nodeId),
  });
  if (!node) return null;
  const planNodes = await db.query.TrainingCurriculumNode.findMany({
    where: eq(TrainingCurriculumNode.planId, node.planId),
  });
  const advancement = planSkillMapAdvancement(
    planNodes.map((row) => ({
      id: row.id,
      parentNodeId: row.parentNodeId,
      kind: row.kind as ProgressionNode["kind"],
      status: row.status as ProgressionNode["status"],
      orderIndex: row.orderIndex,
    })),
    nodeId,
  );
  for (const change of advancement.changes) {
    await db
      .update(TrainingCurriculumNode)
      .set({ status: change.status })
      .where(eq(TrainingCurriculumNode.id, change.nodeId));
  }
  const nextParentId =
    advancement.kind === "foundation_unit"
      ? advancement.skillNodeId
      : advancement.kind === "skillset_unit"
        ? advancement.abilityNodeId
        : null;
  if (!nextParentId) return advancement;
  await Effect.runPromise(
    createNextUnit({
      clusterNodeId: nextParentId,
      deps: createUnitCreationRepositoryDeps({ db, sessionId, userId }),
    }),
  );
  return advancement;
};
