import type { JobRatingState } from "../domain/training/engine/rating";
import type { db as databaseClient } from "@acme/db/client";
import { eq } from "@acme/db";
import { TrainingCurriculumNode, TrainingCurriculumPlan } from "@acme/db/schema";
import { SeedRatingSchema } from "@acme/validators";

type Database = typeof databaseClient;

/**
 * Read the onboarding-derived Glicko seed for the plan that owns `nodeId` and
 * shape it into a {@link JobRatingState}. `lastRatedAt` is left null so decay
 * never fires on a fresh, never-attempted node.
 *
 * Fail-closed: any missing plan, absent seed, parse failure, or query error
 * resolves to `null` (logged), and every caller falls back to
 * `createInitialRatingState()`. A seeding bug can never block a training turn.
 */
export const resolvePlanSeedRating = async ({
  db,
  nodeId,
}: {
  db: Database;
  nodeId: string;
}): Promise<JobRatingState | null> => {
  try {
    const [row] = await db
      .select({ seedRating: TrainingCurriculumPlan.seedRating })
      .from(TrainingCurriculumNode)
      .innerJoin(
        TrainingCurriculumPlan,
        eq(TrainingCurriculumNode.planId, TrainingCurriculumPlan.id),
      )
      .where(eq(TrainingCurriculumNode.id, nodeId))
      .limit(1);

    if (!row?.seedRating) return null;

    const parsed = SeedRatingSchema.safeParse(row.seedRating);
    if (!parsed.success) {
      console.error("Invalid plan seed rating; falling back to defaults", {
        nodeId,
        error: parsed.error,
      });
      return null;
    }

    return {
      rating: parsed.data.rating,
      ratingDeviation: parsed.data.ratingDeviation,
      volatility: parsed.data.volatility,
      lastRatedAt: null,
    };
  } catch (error) {
    console.error("Failed to read plan seed rating; falling back to defaults", {
      nodeId,
      error,
    });
    return null;
  }
};
