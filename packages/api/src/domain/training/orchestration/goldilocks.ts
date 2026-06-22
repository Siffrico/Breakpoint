import type {
  ApplyEvaluationResult,
  AttemptRecord,
  DifficultyBand,
  EvaluatedAttempt,
  JobProgressState,
  JobRatingState,
  MisconceptionState,
  RatingPredictionRecord,
  ScenarioDirective,
} from "../engine/rating";
import {
  applyEvaluation,
  buildGeneratorCalibrationNote,
  createInitialRatingState,
  decayRatingState,
  decideNextScenario,
  renderScenarioDirective,
  validateDifficultyBands,
} from "../engine/rating";

export interface GoldilocksDirectiveResult {
  directive: ScenarioDirective;
  promptBlock: string;
  ratingSnapshot: string;
}

interface GoldilocksJobProgress {
  ratingState: JobRatingState;
  progress: JobProgressState;
  misconceptions: MisconceptionState[];
  recentAttempts: AttemptRecord[];
  masteredAt: Date | null;
}

interface GoldilocksOpenScenario {
  id: string;
  directiveJson: ScenarioDirective;
  itemRating: number;
}

export interface PrepareScenarioDirectiveDependencies {
  loadJobProgress: (input: {
    userId: string;
    nodeId: string;
    initialRatingState: JobRatingState;
  }) => Promise<GoldilocksJobProgress>;
  listRecentPredictions: (input: {
    userId: string;
    nodeId: string;
  }) => Promise<RatingPredictionRecord[]>;
  openScenarioAttempt: (input: {
    userId: string;
    nodeId: string;
    directive: ScenarioDirective;
    itemRating: number;
  }) => Promise<unknown>;
}

export interface RecordEvaluationDependencies {
  getOpenScenario: (input: {
    userId: string;
    nodeId: string;
  }) => Promise<GoldilocksOpenScenario | null>;
  loadJobProgress: (input: {
    userId: string;
    nodeId: string;
    initialRatingState: JobRatingState;
  }) => Promise<GoldilocksJobProgress>;
  saveEvaluationResult: (input: {
    userId: string;
    nodeId: string;
    scenarioAttemptId: string;
    result: ApplyEvaluationResult;
    nextProgress: JobProgressState;
    masteredAt: Date | null;
  }) => Promise<void>;
}

export const deriveDefaultBands = (): readonly DifficultyBand[] => [
  {
    order: 0,
    minRating: 850,
    maxRating: 1050,
    label: "Band 1",
  },
  {
    order: 1,
    minRating: 1050,
    maxRating: 1250,
    label: "Band 2",
  },
  {
    order: 2,
    minRating: 1250,
    maxRating: 1450,
    label: "Band 3",
  },
];

const resolveBands = (bands?: readonly DifficultyBand[] | null) => {
  try {
    return validateDifficultyBands(
      bands && bands.length > 0 ? bands : deriveDefaultBands(),
    );
  } catch (error) {
    console.error("Invalid training difficulty bands; using defaults", error);
    return validateDifficultyBands(deriveDefaultBands());
  }
};

const bandLabel = (
  bands: readonly DifficultyBand[],
  bandOrder: number,
): string => {
  const band = bands.find((candidate) => candidate.order === bandOrder);
  return band?.label ?? `Band ${bandOrder + 1}`;
};

const buildRatingSnapshot = ({
  rating,
  ratingDeviation,
  band,
  lastRatedAt,
}: {
  rating: number;
  ratingDeviation: number;
  band: string;
  lastRatedAt: Date | null;
}) => {
  const trend = lastRatedAt ? "active" : "new";
  return `${Math.round(rating)} ±${Math.round(ratingDeviation)}, ${band}, trend: ${trend}`;
};

export const clampClaimedItemRating = ({
  claimed,
  target,
  window = 100,
}: {
  claimed: number | null | undefined;
  target: number;
  window?: number;
}): number => {
  if (typeof claimed !== "number" || !Number.isFinite(claimed)) return target;

  const value = Math.round(claimed);
  if (Math.abs(value - target) > window * 3) return target;
  return Math.min(target + window, Math.max(target - window, value));
};

export const prepareScenarioDirective = async ({
  userId,
  nodeId,
  now,
  bands,
  deps,
}: {
  userId: string;
  nodeId: string;
  now: Date;
  bands?: readonly DifficultyBand[] | null;
  deps: PrepareScenarioDirectiveDependencies;
}): Promise<GoldilocksDirectiveResult> => {
  const resolvedBands = resolveBands(bands);
  const [loaded, predictions] = await Promise.all([
    deps.loadJobProgress({
      userId,
      nodeId,
      initialRatingState: createInitialRatingState(),
    }),
    deps.listRecentPredictions({ userId, nodeId }),
  ]);
  const rating = decayRatingState(loaded.ratingState, now);
  const directive = decideNextScenario({
    rating,
    progress: loaded.progress,
    bands: resolvedBands,
    misconceptions: loaded.misconceptions,
    recentAttempts: loaded.recentAttempts,
  });
  const band = resolvedBands.find(
    (candidate) => candidate.order === directive.bandOrder,
  );
  if (!band) {
    throw new RangeError(`missing band ${directive.bandOrder}`);
  }

  const calibration = buildGeneratorCalibrationNote(predictions);
  const promptBlock = renderScenarioDirective(directive, band, calibration);
  await deps.openScenarioAttempt({
    userId,
    nodeId,
    directive,
    itemRating: directive.targetItemRating,
  });

  return {
    directive,
    promptBlock,
    ratingSnapshot: buildRatingSnapshot({
      rating: rating.rating,
      ratingDeviation: rating.ratingDeviation,
      band: bandLabel(resolvedBands, directive.bandOrder),
      lastRatedAt: rating.lastRatedAt,
    }),
  };
};

export const recordEvaluation = async ({
  userId,
  nodeId,
  score,
  errorCodes,
  sidechatAskCount = 0,
  wasOverTime = false,
  occurredAt,
  bands,
  deps,
}: {
  userId: string;
  nodeId: string;
  score: number | null | undefined;
  errorCodes: readonly string[];
  sidechatAskCount?: number;
  wasOverTime?: boolean;
  occurredAt: Date;
  bands?: readonly DifficultyBand[] | null;
  deps: RecordEvaluationDependencies;
}): Promise<{ recorded: boolean; reason?: string }> => {
  if (score == null) return { recorded: false, reason: "missing_score" };

  const openScenario = await deps.getOpenScenario({
    userId,
    nodeId,
  });
  if (!openScenario)
    return { recorded: false, reason: "missing_open_scenario" };

  const loaded = await deps.loadJobProgress({
    userId,
    nodeId,
    initialRatingState: createInitialRatingState(),
  });
  const directive = openScenario.directiveJson;
  const evaluation: EvaluatedAttempt = {
    bandOrder: directive.bandOrder,
    score,
    offeredSupport: directive.supportLevel,
    sidechatAskCount,
    wasOverTime,
    itemRating: openScenario.itemRating,
    occurredAt,
    errorCodes: [...new Set(errorCodes.filter(Boolean))],
    targetedMisconceptionCode: directive.targetMisconceptionCode,
  };

  try {
    const result = applyEvaluation({
      ratingState: loaded.ratingState,
      misconceptions: loaded.misconceptions,
      evaluation,
    });
    const resolvedBands = resolveBands(bands);
    const nextDirective = decideNextScenario({
      rating: result.ratingState,
      progress: directive.nextProgress,
      bands: resolvedBands,
      misconceptions: result.misconceptions,
      recentAttempts: [...loaded.recentAttempts, result.attempt],
    });
    const masteredAt =
      loaded.masteredAt ??
      (nextDirective.intent === "mastered" || directive.intent === "mastered"
        ? occurredAt
        : null);

    await deps.saveEvaluationResult({
      userId,
      nodeId,
      scenarioAttemptId: openScenario.id,
      result,
      nextProgress: nextDirective.nextProgress,
      masteredAt,
    });

    return { recorded: true };
  } catch (error) {
    if (error instanceof RangeError) {
      console.error("Skipping training rating update after bad eval contract", {
        userId,
        nodeId,
        scenarioAttemptId: openScenario.id,
        error,
      });
      return { recorded: false, reason: "invalid_evaluation_contract" };
    }
    throw error;
  }
};
