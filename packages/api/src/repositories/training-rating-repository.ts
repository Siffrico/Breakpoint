import type { db as databaseClient } from "@acme/db/client";
import type { ScenarioEvaluationContract } from "@acme/validators";
import { and, asc, desc, eq } from "@acme/db";
import {
  TrainingJobProgress,
  TrainingMisconception,
  TrainingRatingPrediction,
  TrainingScenarioAttempt,
} from "@acme/db/schema";

type Database = typeof databaseClient;

type SupportLevel = "worked_example" | "guided" | "none";

interface JobRatingState {
  rating: number;
  ratingDeviation: number;
  volatility: number;
  lastRatedAt: Date | null;
}

interface JobProgressState {
  bandOrder: number;
  supportLevel: SupportLevel;
}

interface MisconceptionState {
  code: string;
  status: "active" | "addressed" | "resolved";
  occurrences: number;
  lastSeenAt: Date;
}

interface AttemptRecord {
  bandOrder: number;
  offeredSupport: SupportLevel;
  itemRating: number;
  score: number;
  outcome: number;
  effectiveSupport: SupportLevel;
  cleanPass: boolean;
  pass: boolean;
  hardFail: boolean;
  occurredAt: Date;
}

interface RatingPredictionRecord {
  ratingBefore: number;
  ratingDeviationBefore: number;
  ratingAfter: number;
  ratingDeviationAfter: number;
  itemRating: number;
  predictedScore: number;
  actualOutcome: number;
  occurredAt: Date;
}

interface ScenarioDirective {
  intent:
    | "repair"
    | "probe"
    | "back_off"
    | "promote"
    | "fade_support"
    | "challenge"
    | "mastered";
  bandOrder: number;
  supportLevel: SupportLevel;
  targetItemRating: number;
  targetMisconceptionCode: string | null;
  reason: string;
  nextProgress: JobProgressState;
}

interface ApplyEvaluationResult {
  ratingState: JobRatingState;
  misconceptions: MisconceptionState[];
  attempt: AttemptRecord;
  prediction: RatingPredictionRecord;
}

const DEFAULT_PROGRESS: JobProgressState = {
  bandOrder: 0,
  supportLevel: "worked_example",
};

const RECENT_ATTEMPT_LIMIT = 20;
const MANUAL_DIFFICULTY_NUDGE = 50;

const toAttemptRecord = (attempt: {
  bandOrder: number;
  offeredSupport: SupportLevel;
  itemRating: number;
  score: number;
  outcome: number;
  effectiveSupport: SupportLevel;
  cleanPass: boolean;
  pass: boolean;
  hardFail: boolean;
  occurredAt: string;
}): AttemptRecord => ({
  ...attempt,
  occurredAt: new Date(attempt.occurredAt),
});

const serializeAttemptRecord = (attempt: AttemptRecord) => ({
  ...attempt,
  occurredAt: attempt.occurredAt.toISOString(),
});

const toRatingPredictionRecord = (
  row: typeof TrainingRatingPrediction.$inferSelect,
): RatingPredictionRecord => ({
  ratingBefore: row.ratingBefore,
  ratingDeviationBefore: row.ratingDeviationBefore,
  ratingAfter: row.ratingAfter,
  ratingDeviationAfter: row.ratingDeviationAfter,
  itemRating: row.itemRating,
  predictedScore: row.predictedScore,
  actualOutcome: row.actualOutcome,
  occurredAt: row.occurredAt,
});

export const trainingRatingRepository = {
  loadJobProgress: async ({
    db,
    userId,
    nodeId,
    initialRatingState,
  }: {
    db: Database;
    userId: string;
    nodeId: string;
    initialRatingState: JobRatingState;
  }): Promise<{
    ratingState: JobRatingState;
    progress: JobProgressState;
    misconceptions: MisconceptionState[];
    recentAttempts: AttemptRecord[];
    masteredAt: Date | null;
  }> => {
    const [progressRow, misconceptionRows] = await Promise.all([
      db.query.TrainingJobProgress.findFirst({
        where: and(
          eq(TrainingJobProgress.userId, userId),
          eq(TrainingJobProgress.nodeId, nodeId),
        ),
      }),
      db.query.TrainingMisconception.findMany({
        where: and(
          eq(TrainingMisconception.userId, userId),
          eq(TrainingMisconception.nodeId, nodeId),
        ),
        orderBy: [asc(TrainingMisconception.code)],
      }),
    ]);

    return {
      ratingState: progressRow
        ? {
            rating: progressRow.rating,
            ratingDeviation: progressRow.ratingDeviation,
            volatility: progressRow.volatility,
            lastRatedAt: progressRow.lastRatedAt,
          }
        : initialRatingState,
      progress: progressRow
        ? {
            bandOrder: progressRow.bandOrder,
            supportLevel: progressRow.supportLevel as SupportLevel,
          }
        : DEFAULT_PROGRESS,
      misconceptions: misconceptionRows.map((row) => ({
        code: row.code,
        status: row.status as MisconceptionState["status"],
        occurrences: row.occurrences,
        lastSeenAt: row.lastSeenAt,
      })),
      recentAttempts: (progressRow?.recentAttemptsJson ?? []).map(
        toAttemptRecord,
      ),
      masteredAt: progressRow?.masteredAt ?? null,
    };
  },

  listRecentPredictions: async ({
    db,
    userId,
    nodeId,
    limit = 8,
  }: {
    db: Database;
    userId: string;
    nodeId: string;
    limit?: number;
  }): Promise<RatingPredictionRecord[]> => {
    const rows = await db.query.TrainingRatingPrediction.findMany({
      where: and(
        eq(TrainingRatingPrediction.userId, userId),
        eq(TrainingRatingPrediction.nodeId, nodeId),
      ),
      orderBy: [desc(TrainingRatingPrediction.occurredAt)],
      limit,
    });

    return rows.reverse().map(toRatingPredictionRecord);
  },

  openScenarioAttempt: async ({
    db,
    userId,
    nodeId,
    directive,
    itemRating,
  }: {
    db: Database;
    userId: string;
    nodeId: string;
    directive: ScenarioDirective;
    itemRating: number;
  }) => {
    const [row] = await db
      .insert(TrainingScenarioAttempt)
      .values({
        userId,
        nodeId,
        status: "open",
        directiveJson: directive,
        itemRating,
        targetMisconceptionCode: directive.targetMisconceptionCode,
        supportLevel: directive.supportLevel,
      })
      .returning();

    if (!row) {
      throw new Error("Scenario attempt could not be opened.");
    }

    return row;
  },

  getOpenScenarioById: async ({
    db,
    scenarioAttemptId,
    userId,
    nodeId,
  }: {
    db: Database;
    scenarioAttemptId: string;
    userId: string;
    nodeId: string;
  }) =>
    (await db.query.TrainingScenarioAttempt.findFirst({
      where: and(
        eq(TrainingScenarioAttempt.id, scenarioAttemptId),
        eq(TrainingScenarioAttempt.userId, userId),
        eq(TrainingScenarioAttempt.nodeId, nodeId),
        eq(TrainingScenarioAttempt.status, "open"),
      ),
    })) ?? null,

  updateScenarioItemRating: async ({
    db,
    scenarioAttemptId,
    itemRating,
  }: {
    db: Database;
    scenarioAttemptId: string;
    itemRating: number;
  }) => {
    const [row] = await db
      .update(TrainingScenarioAttempt)
      .set({ itemRating })
      .where(
        and(
          eq(TrainingScenarioAttempt.id, scenarioAttemptId),
          eq(TrainingScenarioAttempt.status, "open"),
        ),
      )
      .returning();

    return row ?? null;
  },

  updateScenarioContract: async ({
    db,
    scenarioAttemptId,
    scenarioPrompt,
    scenarioContract,
  }: {
    db: Database;
    scenarioAttemptId: string;
    scenarioPrompt: string;
    scenarioContract: ScenarioEvaluationContract;
  }) => {
    const [row] = await db
      .update(TrainingScenarioAttempt)
      .set({
        scenarioPrompt,
        scenarioContractJson: scenarioContract,
        contractVersion: scenarioContract.version,
        presentedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingScenarioAttempt.id, scenarioAttemptId),
          eq(TrainingScenarioAttempt.status, "open"),
        ),
      )
      .returning();

    return row ?? null;
  },

  applyManualDifficultyNudge: async ({
    db,
    userId,
    nodeId,
    signal,
    initialRatingState,
    now,
  }: {
    db: Database;
    userId: string;
    nodeId: string;
    signal: "too_easy" | "too_hard";
    initialRatingState: JobRatingState;
    now: Date;
  }): Promise<{
    previousRating: number;
    nextRating: number;
    delta: number;
  }> => {
    const existing = await db.query.TrainingJobProgress.findFirst({
      where: and(
        eq(TrainingJobProgress.userId, userId),
        eq(TrainingJobProgress.nodeId, nodeId),
      ),
    });
    const delta =
      signal === "too_easy"
        ? MANUAL_DIFFICULTY_NUDGE
        : -MANUAL_DIFFICULTY_NUDGE;
    const previousRating = existing?.rating ?? initialRatingState.rating;
    const nextRating = previousRating + delta;

    await db.transaction(async (tx) => {
      await tx
        .update(TrainingScenarioAttempt)
        .set({ status: "replaced", evaluatedAt: now })
        .where(
          and(
            eq(TrainingScenarioAttempt.userId, userId),
            eq(TrainingScenarioAttempt.nodeId, nodeId),
            eq(TrainingScenarioAttempt.status, "open"),
          ),
        );

      await tx
        .insert(TrainingJobProgress)
        .values({
          userId,
          nodeId,
          rating: nextRating,
          ratingDeviation:
            existing?.ratingDeviation ?? initialRatingState.ratingDeviation,
          volatility: existing?.volatility ?? initialRatingState.volatility,
          lastRatedAt: now,
          bandOrder: existing?.bandOrder ?? DEFAULT_PROGRESS.bandOrder,
          supportLevel: existing?.supportLevel ?? DEFAULT_PROGRESS.supportLevel,
          recentAttemptsJson: existing?.recentAttemptsJson ?? [],
          masteredAt: existing?.masteredAt ?? null,
        })
        .onConflictDoUpdate({
          target: [TrainingJobProgress.userId, TrainingJobProgress.nodeId],
          set: {
            rating: nextRating,
            lastRatedAt: now,
          },
        });
    });

    return { previousRating, nextRating, delta };
  },

  saveEvaluationResult: async ({
    db,
    userId,
    nodeId,
    scenarioAttemptId,
    result,
    nextProgress,
    masteredAt,
  }: {
    db: Database;
    userId: string;
    nodeId: string;
    scenarioAttemptId: string;
    result: ApplyEvaluationResult;
    nextProgress: JobProgressState;
    masteredAt: Date | null;
  }): Promise<void> => {
    const existing = await db.query.TrainingJobProgress.findFirst({
      where: and(
        eq(TrainingJobProgress.userId, userId),
        eq(TrainingJobProgress.nodeId, nodeId),
      ),
    });
    const recentAttempts = [
      ...(existing?.recentAttemptsJson ?? []).map(toAttemptRecord),
      result.attempt,
    ]
      .slice(-RECENT_ATTEMPT_LIMIT)
      .map(serializeAttemptRecord);

    await db
      .insert(TrainingJobProgress)
      .values({
        userId,
        nodeId,
        rating: result.ratingState.rating,
        ratingDeviation: result.ratingState.ratingDeviation,
        volatility: result.ratingState.volatility,
        lastRatedAt: result.ratingState.lastRatedAt,
        bandOrder: nextProgress.bandOrder,
        supportLevel: nextProgress.supportLevel,
        recentAttemptsJson: recentAttempts,
        masteredAt,
      })
      .onConflictDoUpdate({
        target: [TrainingJobProgress.userId, TrainingJobProgress.nodeId],
        set: {
          rating: result.ratingState.rating,
          ratingDeviation: result.ratingState.ratingDeviation,
          volatility: result.ratingState.volatility,
          lastRatedAt: result.ratingState.lastRatedAt,
          bandOrder: nextProgress.bandOrder,
          supportLevel: nextProgress.supportLevel,
          recentAttemptsJson: recentAttempts,
          masteredAt,
        },
      });

    for (const misconception of result.misconceptions) {
      await db
        .insert(TrainingMisconception)
        .values({
          userId,
          nodeId,
          code: misconception.code,
          status: misconception.status,
          occurrences: misconception.occurrences,
          lastSeenAt: misconception.lastSeenAt,
        })
        .onConflictDoUpdate({
          target: [
            TrainingMisconception.userId,
            TrainingMisconception.nodeId,
            TrainingMisconception.code,
          ],
          set: {
            status: misconception.status,
            occurrences: misconception.occurrences,
            lastSeenAt: misconception.lastSeenAt,
          },
        });
    }

    await db.insert(TrainingRatingPrediction).values({
      userId,
      nodeId,
      ratingBefore: result.prediction.ratingBefore,
      ratingDeviationBefore: result.prediction.ratingDeviationBefore,
      ratingAfter: result.prediction.ratingAfter,
      ratingDeviationAfter: result.prediction.ratingDeviationAfter,
      itemRating: result.prediction.itemRating,
      predictedScore: result.prediction.predictedScore,
      actualOutcome: result.prediction.actualOutcome,
      occurredAt: result.prediction.occurredAt,
    });

    await db
      .update(TrainingScenarioAttempt)
      .set({ status: "evaluated", evaluatedAt: result.prediction.occurredAt })
      .where(eq(TrainingScenarioAttempt.id, scenarioAttemptId));
  },
};
