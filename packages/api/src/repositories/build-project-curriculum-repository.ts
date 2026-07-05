import type { db as databaseClient } from "@acme/db/client";
import { eq } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
} from "@acme/db/schema";

import type { CurriculumBlueprint } from "../domain/training/types/training.types";
import { insertBlueprintNodes } from "./training-curriculum-node-writer";

type Database = typeof databaseClient;

export const buildProjectCurriculumRepository = {
  upsertPlanShell: async ({
    db,
    sessionId,
    userId,
    title,
    summary,
    targetIdentity,
    seedRating = null,
  }: {
    db: Database;
    sessionId: string;
    userId?: string | null;
    title: string;
    summary: string;
    targetIdentity: string;
    seedRating?: {
      rating: number;
      ratingDeviation: number;
      volatility: number;
    } | null;
  }): Promise<typeof TrainingCurriculumPlan.$inferSelect> => {
    await db
      .insert(TrainingCurriculumPlan)
      .values({
        userId: userId ?? null,
        onboardingSessionId: sessionId,
        profileVersionId: null,
        status: "generating",
        title,
        summary,
        targetIdentity,
        seedRating,
      })
      .onConflictDoNothing({
        target: TrainingCurriculumPlan.onboardingSessionId,
      });

    const plan = await db.query.TrainingCurriculumPlan.findFirst({
      where: eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
    });

    if (!plan) {
      throw new Error("Failed to create the project plan shell.");
    }

    // Backfill the seed on a resume where the shell was created before the
    // starting point was known (onConflictDoNothing skips the insert above).
    if (seedRating && !plan.seedRating) {
      await db
        .update(TrainingCurriculumPlan)
        .set({ seedRating })
        .where(eq(TrainingCurriculumPlan.id, plan.id));
      return { ...plan, seedRating };
    }

    return plan;
  },

  getPlanRow: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<typeof TrainingCurriculumPlan.$inferSelect | null> => {
    const plan = await db.query.TrainingCurriculumPlan.findFirst({
      where: eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
    });
    return plan ?? null;
  },

  linkPlanProfileVersion: async ({
    db,
    planId,
    profileVersionId,
  }: {
    db: Database;
    planId: string;
    profileVersionId: string;
  }) => {
    await db
      .update(TrainingCurriculumPlan)
      .set({ profileVersionId })
      .where(eq(TrainingCurriculumPlan.id, planId));
  },

  replacePlanNodes: async ({
    db,
    planId,
    blueprint,
    title,
    summary,
    targetIdentity,
  }: {
    db: Database;
    planId: string;
    blueprint: CurriculumBlueprint;
    title?: string;
    summary?: string;
    targetIdentity?: string;
  }) => {
    if (title || summary || targetIdentity) {
      await db
        .update(TrainingCurriculumPlan)
        .set({
          ...(title ? { title } : {}),
          ...(summary ? { summary } : {}),
          ...(targetIdentity ? { targetIdentity } : {}),
        })
        .where(eq(TrainingCurriculumPlan.id, planId));
    }

    await db
      .delete(TrainingCurriculumNode)
      .where(eq(TrainingCurriculumNode.planId, planId));

    await insertBlueprintNodes({ db, planId, blueprint });
  },

  updatePlanOverview: async ({
    db,
    sessionId,
    overview,
  }: {
    db: Database;
    sessionId: string;
    overview: { title: string; summary: string; body: string };
  }) => {
    await db
      .update(TrainingCurriculumPlan)
      .set({ overview, overviewGeneratedAt: new Date() })
      .where(eq(TrainingCurriculumPlan.onboardingSessionId, sessionId));
  },

  finalizePlan: async ({
    db,
    planId,
    status = "active",
  }: {
    db: Database;
    planId: string;
    status?: string;
  }) => {
    await db
      .update(TrainingCurriculumPlan)
      .set({ status })
      .where(eq(TrainingCurriculumPlan.id, planId));
  },
};
