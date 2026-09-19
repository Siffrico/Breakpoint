import type { db as databaseClient } from "@acme/db/client";
import { and, asc, desc, eq, inArray } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingUnitAttempt,
  TrainingUnitContent,
} from "@acme/db/schema";

import type { Debrief } from "../domain/training/types/training.types";

type Database = typeof databaseClient;

export const trainingAttemptRepository = {
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
      .insert(TrainingUnitAttempt)
      .values({
        onboardingSessionId: sessionId,
        userId: userId ?? null,
        unitContentId: unitId,
        response,
        checksMet: debrief.checksMet,
        checksTotal: debrief.checksTotal,
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
    (await db.query.TrainingUnitAttempt.findFirst({
      where: and(
        eq(TrainingUnitAttempt.onboardingSessionId, sessionId),
        eq(TrainingUnitAttempt.unitContentId, unitId),
      ),
      orderBy: [desc(TrainingUnitAttempt.createdAt)],
    })) ?? null,

  /**
   * Oldest-first attempt history. Callers that only need the recent tail pass
   * `limit`, which is applied in the query rather than sliced afterwards — the
   * whole history rides a prompt or a render, and neither improves by loading
   * attempts nobody reads.
   */
  listAttemptHistory: async ({
    db,
    sessionId,
    limit,
  }: {
    db: Database;
    sessionId: string;
    limit?: number;
  }) => {
    // Newest-first + limit is how the database can honour a tail; flip back to
    // oldest-first afterwards so every caller sees the same ordering.
    const rows = await db.query.TrainingUnitAttempt.findMany({
      where: eq(TrainingUnitAttempt.onboardingSessionId, sessionId),
      orderBy: limit
        ? desc(TrainingUnitAttempt.createdAt)
        : asc(TrainingUnitAttempt.createdAt),
      limit,
    });
    const attempts = limit ? rows.reverse() : rows;

    if (attempts.length === 0) {
      return [];
    }

    const unitRows = await db.query.TrainingUnitContent.findMany({
      columns: { id: true, title: true },
      where: inArray(TrainingUnitContent.id, [
        ...new Set(attempts.map((attempt) => attempt.unitContentId)),
      ]),
    });
    const titlesById = new Map(unitRows.map((unit) => [unit.id, unit.title]));

    return attempts.map((attempt) => ({
      title: titlesById.get(attempt.unitContentId) ?? "Completed unit",
      checksMet: attempt.checksMet,
      checksTotal: attempt.checksTotal,
      readiness: attempt.readiness,
      finalArticulation: attempt.finalArticulation,
      growthDimensions: attempt.growthDimensions,
      improvements: attempt.improvements,
      failureTags: attempt.failureTags,
      nextStep: attempt.nextStep,
    }));
  },

  listLatestAttemptsByUnitIds: async ({
    db,
    sessionId,
    unitIds,
  }: {
    db: Database;
    sessionId: string;
    unitIds: string[];
  }) => {
    if (unitIds.length === 0) {
      return [];
    }

    const attempts = await db.query.TrainingUnitAttempt.findMany({
      where: and(
        eq(TrainingUnitAttempt.onboardingSessionId, sessionId),
        inArray(TrainingUnitAttempt.unitContentId, unitIds),
      ),
      orderBy: [desc(TrainingUnitAttempt.createdAt)],
    });

    const latestByUnit = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      if (!latestByUnit.has(attempt.unitContentId)) {
        latestByUnit.set(attempt.unitContentId, attempt);
      }
    }

    return unitIds
      .map((unitId) => latestByUnit.get(unitId))
      .filter(
        (attempt): attempt is NonNullable<typeof attempt> => attempt != null,
      )
      .map((attempt) => ({
        unitContentId: attempt.unitContentId,
        seedResponse: attempt.seedResponse,
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
    const attempts = await db.query.TrainingUnitAttempt.findMany({
      where: eq(TrainingUnitAttempt.onboardingSessionId, sessionId),
      orderBy: asc(TrainingUnitAttempt.createdAt),
    });

    const plan = await db.query.TrainingCurriculumPlan.findFirst({
      where: eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
    });

    if (!plan) {
      return null;
    }

    const nodes = await db.query.TrainingCurriculumNode.findMany({
      where: eq(TrainingCurriculumNode.planId, plan.id),
      orderBy: asc(TrainingCurriculumNode.orderIndex),
    });

    const currentReadyNode = nodes.find(
      (node) => node.kind === "unit" && node.status === "ready",
    );
    const unit = currentReadyNode
      ? await db.query.TrainingUnitContent.findFirst({
          where: eq(TrainingUnitContent.nodeId, currentReadyNode.id),
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
