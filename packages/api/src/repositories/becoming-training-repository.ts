import { and, asc, desc, eq } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  BecomingCurriculumNode,
  BecomingCurriculumPlan,
  BecomingUnitAttempt,
  BecomingUnitContent,
} from "@acme/db/schema";

import type { Debrief } from "../domain/becoming/types/becoming.types";

type Database = typeof databaseClient;

export const becomingTrainingRepository = {
  saveAttempt: async ({
    db,
    sessionId,
    userId,
    unitId,
    response,
    debrief,
    seedResponse,
    finalArticulation,
    growthDimensions,
  }: {
    db: Database;
    sessionId: string;
    userId?: string | null;
    unitId: string;
    response: string;
    debrief: Debrief;
    seedResponse?: string | null;
    finalArticulation?: string | null;
    growthDimensions?: string[] | null;
  }) => {
    const [attempt] = await db
      .insert(BecomingUnitAttempt)
      .values({
        onboardingSessionId: sessionId,
        userId: userId ?? null,
        unitContentId: unitId,
        response,
        score: debrief.score,
        readiness: debrief.readiness,
        strengths: debrief.strengths,
        improvements: debrief.improvements,
        failureTags: debrief.failureTags,
        targetComparison: null,
        seedResponse: seedResponse ?? null,
        finalArticulation: finalArticulation ?? null,
        growthDimensions: growthDimensions ?? null,
        nextStep: debrief.nextStep,
      })
      .returning();

    return attempt ?? null;
  },

  getLatestAttemptByUnit: async ({
    db,
    sessionId,
    unitId,
  }: {
    db: Database;
    sessionId: string;
    unitId: string;
  }) =>
    (await db.query.BecomingUnitAttempt.findFirst({
      where: and(
        eq(BecomingUnitAttempt.onboardingSessionId, sessionId),
        eq(BecomingUnitAttempt.unitContentId, unitId),
      ),
      orderBy: [desc(BecomingUnitAttempt.createdAt)],
    })) ?? null,

  listAttemptHistory: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const attempts = await db.query.BecomingUnitAttempt.findMany({
      where: eq(BecomingUnitAttempt.onboardingSessionId, sessionId),
      orderBy: asc(BecomingUnitAttempt.createdAt),
    });

    if (attempts.length === 0) {
      return [];
    }

    const unitRows = await db.query.BecomingUnitContent.findMany();
    const unitsById = new Map(unitRows.map((unit) => [unit.id, unit]));

    return attempts.map((attempt) => ({
      title: unitsById.get(attempt.unitContentId)?.title ?? "Completed unit",
      score: attempt.score,
      readiness: attempt.readiness,
      finalArticulation: attempt.finalArticulation,
      growthDimensions: attempt.growthDimensions,
      improvements: attempt.improvements,
      failureTags: attempt.failureTags,
      nextStep: attempt.nextStep,
    }));
  },

  getHomeSummary: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const attempts = await db.query.BecomingUnitAttempt.findMany({
      where: eq(BecomingUnitAttempt.onboardingSessionId, sessionId),
      orderBy: asc(BecomingUnitAttempt.createdAt),
    });

    const plan = await db.query.BecomingCurriculumPlan.findFirst({
      where: eq(BecomingCurriculumPlan.onboardingSessionId, sessionId),
    });

    if (!plan) {
      return null;
    }

    const nodes = await db.query.BecomingCurriculumNode.findMany({
      where: eq(BecomingCurriculumNode.planId, plan.id),
      orderBy: asc(BecomingCurriculumNode.orderIndex),
    });

    const currentReadyNode = nodes.find(
      (node) =>
        (node.kind === "unit" || node.kind === "integration") &&
        node.status === "ready",
    );
    const unit = currentReadyNode
      ? await db.query.BecomingUnitContent.findFirst({
          where: eq(BecomingUnitContent.nodeId, currentReadyNode.id),
        })
      : null;

    const recentFailureTags = attempts
      .flatMap((attempt) => attempt.failureTags)
      .slice(-3);

    return {
      attempts,
      currentReadyNode,
      currentUnit: unit,
      recentFailureTags,
    };
  },
};
