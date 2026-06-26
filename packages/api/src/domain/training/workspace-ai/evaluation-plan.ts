import type { PhaseResponseRecord } from "../types/training.types";
import type { AttemptTiming, EvaluationMode, EvaluationPlan } from "./types";
import { EvaluationPlanSchema } from "./types";

const INITIAL_SCENARIO_COUNT_BY_MODE: Record<EvaluationMode, 1 | 2 | 3> = {
  intuition_sprint: 3,
  standard: 2,
  deep_reasoning: 1,
};

const DEFAULT_TIME_LIMIT_BY_MODE: Record<EvaluationMode, 30 | 300 | 600> = {
  intuition_sprint: 30,
  standard: 300,
  deep_reasoning: 600,
};

const INTUITION_TIME_LIMITS = new Set([30, 45, 60]);

export const normalizeEvaluationPlan = ({
  plan,
  isRetryAfterFailure,
}: {
  plan: EvaluationPlan;
  isRetryAfterFailure: boolean;
}): EvaluationPlan => {
  const mode = plan.mode;
  const defaultTimeLimit = DEFAULT_TIME_LIMIT_BY_MODE[mode];
  const timeLimitSeconds =
    mode === "intuition_sprint"
      ? INTUITION_TIME_LIMITS.has(plan.timeLimitSeconds)
        ? (plan.timeLimitSeconds as 30 | 45 | 60)
        : defaultTimeLimit
      : defaultTimeLimit;

  return {
    mode,
    scenarioCount: isRetryAfterFailure
      ? 1
      : INITIAL_SCENARIO_COUNT_BY_MODE[mode],
    timeLimitSeconds,
    feedbackMode: "full_after_each",
    reason: plan.reason,
  };
};

export const parseAttemptTiming = (value: unknown): AttemptTiming | null => {
  if (!value || typeof value !== "object") return null;

  const timing = value as Partial<AttemptTiming>;
  const elapsedSeconds =
    typeof timing.elapsedSeconds === "number"
      ? Math.trunc(timing.elapsedSeconds)
      : null;
  const timeLimitSeconds =
    typeof timing.timeLimitSeconds === "number"
      ? Math.trunc(timing.timeLimitSeconds)
      : null;

  if (
    elapsedSeconds == null ||
    timeLimitSeconds == null ||
    timeLimitSeconds <= 0
  ) {
    return null;
  }

  const overrunSeconds = Math.max(0, elapsedSeconds - timeLimitSeconds);

  return {
    elapsedSeconds,
    timeLimitSeconds,
    overrunSeconds,
    wasOverTime: overrunSeconds > 0,
    pausedSeconds:
      typeof timing.pausedSeconds === "number"
        ? Math.max(0, Math.trunc(timing.pausedSeconds))
        : undefined,
  };
};

export const selectLatestEvaluationPlan = (
  responses: PhaseResponseRecord[],
): EvaluationPlan | null => {
  for (const response of responses.slice().reverse()) {
    const parsed = EvaluationPlanSchema.safeParse(
      response.metadata?.evaluationPlan,
    );
    if (parsed.success) {
      return parsed.data;
    }
  }

  return null;
};

export const hasFailedEvaluationAttempt = (
  responses: PhaseResponseRecord[],
): boolean =>
  responses.some(
    (response) =>
      response.phase === "ai_education" &&
      response.metadata?.promptKind === "evaluate_feedback" &&
      response.metadata.nextScenarioPrompt !== true &&
      (response.passed === false ||
        response.metadata.verdict === "retry" ||
        response.metadata.verdict === "repair" ||
        (response.score != null && response.score < 80)),
  );

export const getEvaluationProgress = (
  responses: PhaseResponseRecord[],
): {
  completedAttempts: number;
  latestPlan: EvaluationPlan | null;
  canRequestNextScenario: boolean;
} => {
  const latestPlan = selectLatestEvaluationPlan(responses);
  const evaluationResponses = responses.filter(
    (response) =>
      response.phase === "ai_education" &&
      response.metadata?.promptKind === "evaluate_feedback",
  );
  const attemptResponses = evaluationResponses.filter(
    (response) => response.metadata?.nextScenarioPrompt !== true,
  );
  const latestAttempt = attemptResponses.at(-1) ?? null;
  const latestScenarioPrompt = evaluationResponses
    .filter((response) => response.metadata?.nextScenarioPrompt === true)
    .at(-1);

  return {
    completedAttempts: attemptResponses.length,
    latestPlan,
    canRequestNextScenario: Boolean(
      latestPlan &&
        latestAttempt &&
        attemptResponses.length < latestPlan.scenarioCount &&
        (!latestScenarioPrompt ||
          latestScenarioPrompt.createdAt.getTime() <
            latestAttempt.createdAt.getTime()),
    ),
  };
};
