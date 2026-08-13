import type { db as databaseClient } from "@acme/db/client";
import type {
  DifficultyVector,
  JobProgressState,
  ScenarioDirective,
  ScenarioEvaluationContract,
  SupportLevel,
} from "@acme/validators";
import { and, asc, desc, eq, inArray, sql } from "@acme/db";
import {
  TrainingJobProgress,
  TrainingMisconception,
  TrainingRatingPrediction,
  TrainingScenarioAttempt,
} from "@acme/db/schema";

type Database = typeof databaseClient;

const sameDirective = (
  left: ScenarioDirective,
  right: ScenarioDirective,
): boolean =>
  left.intent === right.intent &&
  left.bandOrder === right.bandOrder &&
  left.supportLevel === right.supportLevel &&
  left.targetItemRating === right.targetItemRating &&
  left.targetMisconceptionCode === right.targetMisconceptionCode &&
  left.reason === right.reason &&
  left.nextProgress.bandOrder === right.nextProgress.bandOrder &&
  left.nextProgress.supportLevel === right.nextProgress.supportLevel;

interface JobRatingState {
  rating: number;
  ratingDeviation: number;
  volatility: number;
  lastRatedAt: Date | null;
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

  // Batch-read the learner's live Glicko state for a set of nodes (skill
  // clusters). Nodes with no attempt yet simply have no row — the caller renders
  // those as "not yet rated" rather than substituting a default rating.
  listJobProgressByNodeIds: async ({
    db,
    userId,
    nodeIds,
  }: {
    db: Database;
    userId: string;
    nodeIds: string[];
  }): Promise<
    {
      nodeId: string;
      rating: number;
      ratingDeviation: number;
      lastRatedAt: Date | null;
    }[]
  > => {
    if (nodeIds.length === 0) {
      return [];
    }

    const rows = await db.query.TrainingJobProgress.findMany({
      where: and(
        eq(TrainingJobProgress.userId, userId),
        inArray(TrainingJobProgress.nodeId, nodeIds),
      ),
    });

    return rows.map((row) => ({
      nodeId: row.nodeId,
      rating: row.rating,
      ratingDeviation: row.ratingDeviation,
      lastRatedAt: row.lastRatedAt,
    }));
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

  openEducationScenarioAttempt: async ({
    db,
    unitRunId,
    originTurnId,
    userId,
    nodeId,
    directive,
    itemRating,
    difficultyVector,
    scenarioPrompt,
    scenarioContract,
    presentedAt,
  }: {
    db: Database;
    unitRunId: string;
    originTurnId: string;
    userId: string;
    nodeId: string;
    directive: ScenarioDirective;
    itemRating: number;
    difficultyVector?: DifficultyVector | null;
    scenarioPrompt: string;
    scenarioContract: ScenarioEvaluationContract;
    presentedAt: Date;
  }) => {
    const [inserted] = await db
      .insert(TrainingScenarioAttempt)
      .values({
        userId,
        nodeId,
        status: "open",
        directiveJson: directive,
        itemRating,
        difficultyVectorJson: difficultyVector ?? null,
        targetMisconceptionCode: directive.targetMisconceptionCode,
        supportLevel: directive.supportLevel,
        unitRunId,
        originTurnId,
        scenarioPrompt,
        scenarioContractJson: scenarioContract,
        contractVersion: scenarioContract.version,
        presentedAt,
      })
      .onConflictDoNothing({
        target: [
          TrainingScenarioAttempt.unitRunId,
          TrainingScenarioAttempt.originTurnId,
        ],
      })
      .returning();

    if (inserted) return inserted;

    const existing = await db.query.TrainingScenarioAttempt.findFirst({
      where: and(
        eq(TrainingScenarioAttempt.unitRunId, unitRunId),
        eq(TrainingScenarioAttempt.originTurnId, originTurnId),
        eq(TrainingScenarioAttempt.userId, userId),
        eq(TrainingScenarioAttempt.nodeId, nodeId),
      ),
    });
    if (!existing) {
      throw new Error("Education scenario attempt could not be opened.");
    }
    if (
      !sameDirective(existing.directiveJson, directive) ||
      existing.itemRating !== itemRating ||
      JSON.stringify(existing.difficultyVectorJson) !==
        JSON.stringify(difficultyVector ?? null) ||
      existing.scenarioPrompt !== scenarioPrompt ||
      JSON.stringify(existing.scenarioContractJson) !==
        JSON.stringify(scenarioContract) ||
      existing.originTurnId !== originTurnId
    ) {
      throw new Error(
        "An education scenario attempt cannot be presented more than once.",
      );
    }
    return existing;
  },

  stampSolvePresentation: async ({
    db,
    scenarioAttemptId,
    solvePromptTurnId,
    presentedAt,
  }: {
    db: Database;
    scenarioAttemptId: string;
    solvePromptTurnId: string | null;
    presentedAt: Date;
  }) => {
    const [row] = await db
      .update(TrainingScenarioAttempt)
      .set({
        solvePresentedAt: sql<Date>`coalesce(${TrainingScenarioAttempt.solvePresentedAt}, ${sql.param(presentedAt, TrainingScenarioAttempt.solvePresentedAt)})`,
        solvePromptTurnId: sql<
          string | null
        >`case when ${TrainingScenarioAttempt.solvePresentedAt} is null then ${solvePromptTurnId} else ${TrainingScenarioAttempt.solvePromptTurnId} end`,
      })
      .where(
        and(
          eq(TrainingScenarioAttempt.id, scenarioAttemptId),
          eq(TrainingScenarioAttempt.status, "open"),
        ),
      )
      .returning();
    if (!row) throw new Error("Open scenario attempt could not be timed.");
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
      scenarioAttemptId,
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
