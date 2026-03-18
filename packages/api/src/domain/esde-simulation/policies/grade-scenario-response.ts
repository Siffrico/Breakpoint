import {
  type ScenarioEvaluation,
  type SubmitScenarioResponseInput,
} from "../types/esde-simulation.types";

const keywordGroups = {
  correctness: [
    "root cause",
    "failure mode",
    "race condition",
    "duplicate",
    "idempot",
    "poison",
    "drift",
  ],
  reasoning: [
    "because",
    "therefore",
    "which means",
    "if",
    "then",
    "due to",
  ],
  robustness: [
    "rollback",
    "guardrail",
    "backpressure",
    "dead-letter",
    "circuit breaker",
    "rate limit",
    "kill switch",
    "quarantine",
  ],
  speed: [
    "first",
    "immediately",
    "right now",
    "contain",
    "stabilize",
    "disable",
    "throttle",
  ],
  consistency: [
    "verify",
    "metric",
    "trace",
    "log",
    "dashboard",
    "alert",
    "monitor",
  ],
  transfer: [
    "long term",
    "durable",
    "prevent",
    "system design",
    "policy",
    "runbook",
    "rollout",
    "release",
  ],
} as const;

const includesKeywordFromGroup = (
  response: string,
  keywords: readonly string[],
) => keywords.some((keyword) => response.includes(keyword));

const countSatisfiedKeywords = (
  response: string,
  keywords: readonly string[],
) => keywords.reduce((count, keyword) => count + Number(response.includes(keyword)), 0);

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const buildDimensionScore = ({
  response,
  keywords,
  answerLength,
  bonus = 0,
}: {
  response: string;
  keywords: readonly string[];
  answerLength: number;
  bonus?: number;
}) => {
  const keywordHits = countSatisfiedKeywords(response, keywords);
  return clampScore(keywordHits * 16 + answerLength / 8 + bonus);
};

export const gradeScenarioResponse = (
  input: SubmitScenarioResponseInput,
): ScenarioEvaluation => {
  const normalizedResponse = input.response.trim().toLowerCase();
  const answerLength = normalizedResponse.split(/\s+/).filter(Boolean).length;

  const scoreBreakdown = {
    correctness: buildDimensionScore({
      response: normalizedResponse,
      keywords: keywordGroups.correctness,
      answerLength,
    }),
    reasoning: buildDimensionScore({
      response: normalizedResponse,
      keywords: keywordGroups.reasoning,
      answerLength,
      bonus: normalizedResponse.includes("why") ? 6 : 0,
    }),
    robustness: buildDimensionScore({
      response: normalizedResponse,
      keywords: keywordGroups.robustness,
      answerLength,
    }),
    speed: buildDimensionScore({
      response: normalizedResponse,
      keywords: keywordGroups.speed,
      answerLength,
      bonus: normalizedResponse.includes("first") ? 8 : 0,
    }),
    consistency: buildDimensionScore({
      response: normalizedResponse,
      keywords: keywordGroups.consistency,
      answerLength,
    }),
    transfer: buildDimensionScore({
      response: normalizedResponse,
      keywords: keywordGroups.transfer,
      answerLength,
    }),
  } satisfies ScenarioEvaluation["scoreBreakdown"];

  let overallScore = clampScore(
    Object.values(scoreBreakdown).reduce((sum, score) => sum + score, 0) /
      Object.keys(scoreBreakdown).length,
  );

  const strengths: string[] = [];
  const improvements: string[] = [];
  const rootCauses: ScenarioEvaluation["rootCauses"] = [];
  const repairTargets: ScenarioEvaluation["repairTargets"] = [];

  if (scoreBreakdown.correctness >= 65) {
    strengths.push("You identified a plausible system failure mechanism.");
  } else {
    rootCauses.push("missing_failure_mechanism");
    improvements.push("Name the failure mechanism explicitly, not just the visible symptom.");
    repairTargets.push({
      title: "Failure mechanism",
      instruction:
        "State the underlying systems fault in one sentence before proposing fixes.",
    });
  }

  if (scoreBreakdown.speed >= 65) {
    strengths.push("You showed urgency and named an early containment move.");
  } else {
    rootCauses.push("weak_containment_plan", "weak_prioritization");
    improvements.push("Clarify the first containment step and why it comes before everything else.");
    repairTargets.push({
      title: "Containment order",
      instruction:
        "Write the first, second, and third action with the blast-radius reason for each.",
    });
  }

  if (scoreBreakdown.consistency >= 60) {
    strengths.push("You included verification signals instead of assuming the fix worked.");
  } else {
    rootCauses.push("missing_verification_strategy");
    improvements.push("Explain how you would verify recovery with logs, metrics, traces, or audits.");
    repairTargets.push({
      title: "Verification plan",
      instruction:
        "Name the concrete signals that prove the issue is contained and the system is safe.",
    });
  }

  if (scoreBreakdown.robustness >= 60) {
    strengths.push("Your response accounts for durable safeguards, not just a one-off patch.");
  } else {
    rootCauses.push("weak_system_design");
    improvements.push("Propose a durable architectural or process guardrail that prevents recurrence.");
    repairTargets.push({
      title: "Durable guardrail",
      instruction:
        "Add one structural safeguard such as idempotency, quarantine, staged rollout, or circuit breaking.",
    });
  }

  if (scoreBreakdown.transfer >= 55) {
    strengths.push("You generalized the fix into a repeatable operating principle.");
  } else {
    rootCauses.push("limited_transfer_reasoning");
    improvements.push("Connect the incident fix to a reusable system design or operating rule.");
    repairTargets.push({
      title: "Transfer reasoning",
      instruction:
        "Explain what this incident teaches about designing the next similar system.",
    });
  }

  if (answerLength < 70) {
    overallScore = clampScore(overallScore - 18);
    rootCauses.push("low_signal_response");
    improvements.unshift(
      "The response is too short to show full systems reasoning. Expand diagnosis, containment, verification, and durable design.",
    );
    repairTargets.unshift({
      title: "Response depth",
      instruction:
        "Write enough detail to cover diagnosis, first move, verification, and durable prevention.",
    });
  }

  const readiness: ScenarioEvaluation["readiness"] =
    overallScore >= 85
      ? "ready_for_next_round"
      : overallScore >= 60
        ? "developing"
        : "needs_repair";

  return {
    score: overallScore,
    scoreBreakdown,
    readiness,
    strengths,
    improvements,
    rootCauses: [...new Set(rootCauses)],
    repairTargets,
    nextStage: readiness === "ready_for_next_round" ? "evaluate" : "diagnose",
    recommendedScenarioId: null,
    retryVariantIssued: false,
  };
};
