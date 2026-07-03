import type { db as databaseClient } from "@acme/db/client";
import { and, desc, eq, ne } from "@acme/db";
import { TrainingCurriculumNode } from "@acme/db/schema";

import type { MintNextUnitDependencies } from "../domain/training/unit-minting/mint-next-unit";
import { createInitialRatingState } from "../domain/training/engine/rating";
import { resolveScenarioDirective } from "../domain/training/orchestration/goldilocks";
import { runPrepareUnit } from "../domain/training/unit-preparation/prepare-unit-edge";
import { appendMintedUnitNode } from "./training-curriculum-node-writer";
import { createTrainingRatingGoldilocksDeps } from "./training-rating-goldilocks-deps";
import { trainingRatingRepository } from "./training-rating-repository";
import { trainingSyllabusRepository } from "./training-syllabus-repository";
import { createUnitPreparationRepositoryDeps } from "./unit-preparation-repository-deps";

type Database = typeof databaseClient;
type NodeRow = typeof TrainingCurriculumNode.$inferSelect;

const bandsFromRamp = (ramp: { startRating: number; peakRating: number }) => {
  const span = Math.max(ramp.peakRating - ramp.startRating, 3);
  const width = Math.max(Math.round(span / 3), 1);
  return [0, 1, 2].map((order) => ({
    order,
    minRating: ramp.startRating + width * order,
    maxRating:
      order === 2 ? ramp.peakRating : ramp.startRating + width * (order + 1),
    label: `Band ${order + 1}`,
  }));
};

export const createUnitMintingRepositoryDeps = ({
  db,
  sessionId,
  userId,
}: {
  db: Database;
  sessionId: string;
  userId: string;
}): MintNextUnitDependencies<NodeRow> => ({
  loadSkill: async (clusterNodeId) => {
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
  },
  resolveDirective: async (clusterNodeId) => {
    const cluster = await db.query.TrainingCurriculumNode.findFirst({
      where: eq(TrainingCurriculumNode.id, clusterNodeId),
    });
    if (!cluster?.skillMap) throw new Error("Skill map is missing.");
    return resolveScenarioDirective({
      userId,
      nodeId: clusterNodeId,
      now: new Date(),
      bands: bandsFromRamp(cluster.skillMap.bandRamp),
      deps: createTrainingRatingGoldilocksDeps(db),
    });
  },
  appendUnit: (input) => appendMintedUnitNode({ db, ...input }),
  prepareUnit: async (node) => {
    await runPrepareUnit({
      node,
      sessionId,
      deps: createUnitPreparationRepositoryDeps(db),
    });
  },
});

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
  if (!cluster?.skillMap) throw new Error("Skill map is missing.");
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
