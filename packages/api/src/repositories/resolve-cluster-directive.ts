import type { db as databaseClient } from "@acme/db/client";
import { eq } from "@acme/db";
import { TrainingCurriculumNode } from "@acme/db/schema";

import type { JobRatingState } from "../domain/training/engine/rating";
import {
  difficultyRampOf,
  resolveProgressionModel,
  resolveScenarioFormat,
} from "../domain/training/engine/progression-model";
import { expandSkillBands } from "../domain/training/engine/rating";
import { resolveScenarioDirective } from "../domain/training/orchestration/goldilocks";
import { resolvePlanSeedRating } from "./plan-seed-rating";
import { createTrainingRatingGoldilocksDeps } from "./training-rating-goldilocks-deps";

type Database = typeof databaseClient;

/**
 * The goldilocks call for one skill-map-bearing cluster (skill, ability, or
 * outcome).
 *
 * Shared because two callers need the SAME answer: unit creation, which sizes
 * the new unit's bands from it, and unit preparation, which hands the rendered
 * directive to the scenario generator. Resolving it in one place is what keeps
 * a unit's stated difficulty and its generated task from disagreeing.
 */
export const resolveClusterDirective = async ({
  db,
  userId,
  clusterNodeId,
  seed,
}: {
  db: Database;
  userId: string;
  clusterNodeId: string;
  /** Pre-resolved starting-point seed; looked up when omitted. */
  seed?: JobRatingState | null;
}) => {
  const cluster = await db.query.TrainingCurriculumNode.findFirst({
    where: eq(TrainingCurriculumNode.id, clusterNodeId),
  });
  if (!cluster?.practiceContract) {
    throw new Error("Practice Contract is missing.");
  }
  const model = resolveProgressionModel(cluster);
  if (!model) throw new Error("Outcome progression is invalid.");
  const initialRatingState =
    seed === undefined
      ? await resolvePlanSeedRating({ db, nodeId: clusterNodeId })
      : seed;
  return resolveScenarioDirective({
    userId,
    nodeId: clusterNodeId,
    now: new Date(),
    bands: cluster.difficultyBands ?? expandSkillBands(difficultyRampOf(model)),
    initialRatingState: initialRatingState ?? undefined,
    scenarioFormat: resolveScenarioFormat(cluster.practiceContract),
    deps: createTrainingRatingGoldilocksDeps(db),
  });
};
