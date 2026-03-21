import { asc, eq } from "@acme/db";
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
  }: {
    db: Database;
    sessionId: string;
    userId?: string | null;
    unitId: string;
    response: string;
    debrief: Debrief;
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
        targetComparison: debrief.targetComparison,
        nextStep: debrief.nextStep,
      })
      .returning();

    return attempt ?? null;
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

    const currentReadyNode = nodes.find((node) => node.kind === "unit" && node.status === "ready");
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
