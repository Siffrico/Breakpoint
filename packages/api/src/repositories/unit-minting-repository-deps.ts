import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import { and, desc, eq, ne } from "@acme/db";
import { TrainingCurriculumNode } from "@acme/db/schema";

import type { MintNextUnitDependencies } from "../domain/training/unit-minting/mint-next-unit";
import {
  createInitialRatingState,
  expandSkillBands,
} from "../domain/training/engine/rating";
import { resolveScenarioDirective } from "../domain/training/orchestration/goldilocks";
import { prepareUnitContent } from "../domain/training/unit-preparation/prepare-unit-content";
import { queryWithClient } from "../effect/db";
import { appendMintedUnitNode } from "./training-curriculum-node-writer";
import { trainingCurriculumRepository } from "./training-curriculum-repository";
import { createTrainingRatingGoldilocksDeps } from "./training-rating-goldilocks-deps";
import { trainingRatingRepository } from "./training-rating-repository";
import { trainingSyllabusRepository } from "./training-syllabus-repository";
import { createUnitPreparationRepositoryDeps } from "./unit-preparation-repository-deps";

type Database = typeof databaseClient;
type NodeRow = typeof TrainingCurriculumNode.$inferSelect;

export const createUnitMintingRepositoryDeps = ({
  db,
  sessionId,
  userId,
}: {
  db: Database;
  sessionId: string;
  userId: string;
}): MintNextUnitDependencies<NodeRow> => ({
  loadSkill: (clusterNodeId) =>
    queryWithClient(db, "loadSkillForUnitMinting", async () => {
      const cluster = await db.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, clusterNodeId),
      });
      if (!cluster?.skillMap) return null;
      const [entries, openUnit] = await Promise.all([
        trainingSyllabusRepository.listEntries({ db, clusterNodeId }),
        db.query.TrainingCurriculumNode.findFirst({
          where: and(
            eq(TrainingCurriculumNode.parentNodeId, clusterNodeId),
            eq(TrainingCurriculumNode.kind, "unit"),
            ne(TrainingCurriculumNode.status, "completed"),
          ),
          orderBy: [desc(TrainingCurriculumNode.orderIndex)],
        }),
      ]);
      return {
        title: cluster.title,
        whyItMatters: cluster.whyItMatters,
        entries: entries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          gloss: entry.gloss,
          kind: entry.kind as
            | "discrimination"
            | "concept"
            | "subskill"
            | "vocabulary",
          status: entry.status,
        })),
        openUnit: openUnit ?? null,
      };
    }),
  resolveDirective: (clusterNodeId) =>
    queryWithClient(db, "resolveUnitMintingDirective", async () => {
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
        deps: createTrainingRatingGoldilocksDeps(db),
      });
    }),
  appendUnit: (input) =>
    queryWithClient(db, "appendMintedUnit", () =>
      appendMintedUnitNode({ db, ...input }),
    ),
  hasUnitContent: (nodeId) =>
    queryWithClient(db, "hasMintedUnitContent", async () =>
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
});

/**
 * Load the mastery-progression inputs for a dynamic skill cluster. Returns null
 * when the cluster has no skill map (legacy/imported plans) — those plans never
 * enter the mastery loop, so callers treat null as "nothing to decide".
 */
export const loadSkillMasteryState = async ({
  db,
  clusterNodeId,
  userId,
}: {
  db: Database;
  clusterNodeId: string;
  userId: string;
}) => {
  const cluster = await db.query.TrainingCurriculumNode.findFirst({
    where: eq(TrainingCurriculumNode.id, clusterNodeId),
  });
  if (!cluster?.skillMap) return null;
  const [entries, progress, simulation] = await Promise.all([
    trainingSyllabusRepository.listEntries({ db, clusterNodeId }),
    trainingRatingRepository.loadJobProgress({
      db,
      userId,
      nodeId: clusterNodeId,
      initialRatingState: createInitialRatingState(),
    }),
    db.query.TrainingCurriculumNode.findFirst({
      where: and(
        eq(TrainingCurriculumNode.parentNodeId, clusterNodeId),
        eq(TrainingCurriculumNode.kind, "simulation"),
      ),
    }),
  ]);
  return {
    uncheckedEntryCount: entries.filter((entry) => entry.status !== "checked")
      .length,
    learnerRating: progress.ratingState.rating,
    ratingDeviation: progress.ratingState.ratingDeviation,
    peakRating: cluster.skillMap.bandRamp.peakRating,
    maxRatingDeviation:
      cluster.skillMap.masteryContract.maxRatingDeviation ?? 80,
    simulationPassed: simulation?.status === "completed",
  };
};

export const openSkillSimulation = async ({
  db,
  clusterNodeId,
}: {
  db: Database;
  clusterNodeId: string;
}) => {
  const [simulation] = await db
    .update(TrainingCurriculumNode)
    .set({ status: "ready" })
    .where(
      and(
        eq(TrainingCurriculumNode.parentNodeId, clusterNodeId),
        eq(TrainingCurriculumNode.kind, "simulation"),
      ),
    )
    .returning();
  return simulation ?? null;
};
