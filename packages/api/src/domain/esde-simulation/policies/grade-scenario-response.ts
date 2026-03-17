import {
  type ScenarioEvaluation,
  type SubmitScenarioResponseInput,
} from "../types/esde-simulation.types";

const keywordGroups = {
  diagnosis: ["root cause", "race condition", "duplicate", "idempotency"],
  mitigation: ["queue", "throttle", "rollback", "guardrail", "retry"],
  observability: ["metrics", "logging", "alert", "monitor", "trace"],
  prioritization: ["first", "immediately", "priority", "contain", "stabilize"],
} as const;

const includesKeywordFromGroup = (
  response: string,
  keywords: readonly string[],
) => keywords.some((keyword) => response.includes(keyword));

const countSatisfiedGroups = (response: string) =>
  Object.values(keywordGroups).reduce((count, keywords) => {
    return count + Number(includesKeywordFromGroup(response, keywords));
  }, 0);

export const gradeScenarioResponse = (
  input: SubmitScenarioResponseInput,
): ScenarioEvaluation => {
  const normalizedResponse = input.response.trim().toLowerCase();
  const answerLength = normalizedResponse.split(/\s+/).filter(Boolean).length;
  const satisfiedKeywordGroups = countSatisfiedGroups(normalizedResponse);

  let score = Math.min(100, satisfiedKeywordGroups * 18 + answerLength / 4);

  const strengths: string[] = [];
  const improvements: string[] = [];
  const rootCauses: ScenarioEvaluation["rootCauses"] = [];

  if (includesKeywordFromGroup(normalizedResponse, keywordGroups.diagnosis)) {
    strengths.push("You identified a likely systems-level failure mode.");
  } else {
    improvements.push("Name the most likely failure mechanism, not just the symptom.");
    rootCauses.push("shallow_diagnosis");
  }

  if (includesKeywordFromGroup(normalizedResponse, keywordGroups.mitigation)) {
    strengths.push("You proposed a concrete mitigation rather than vague intent.");
  } else {
    improvements.push("Propose a containment action that can reduce blast radius immediately.");
    rootCauses.push("incomplete_mitigation");
  }

  if (includesKeywordFromGroup(normalizedResponse, keywordGroups.observability)) {
    strengths.push("You accounted for observability and verification.");
  } else {
    improvements.push("Explain how you would verify the fix with logs, metrics, or traces.");
    rootCauses.push("weak_concept_understanding");
  }

  if (includesKeywordFromGroup(normalizedResponse, keywordGroups.prioritization)) {
    strengths.push("Your answer shows some prioritization under pressure.");
  } else {
    improvements.push("State what you would do first, second, and why.");
    rootCauses.push("bad_prioritization");
  }

  if (answerLength < 80) {
    score = Math.max(28, score - 20);
    improvements.unshift(
      "The response is too short to demonstrate full reasoning. Show the chain of thought at the system level.",
    );
  }

  if (answerLength > 220 && satisfiedKeywordGroups >= 3) {
    score = Math.min(100, score + 8);
  }

  const readiness: ScenarioEvaluation["readiness"] =
    score >= 85
      ? "ready_for_next_round"
      : score >= 60
        ? "developing"
        : "needs_repair";

  return {
    score: Math.round(score),
    readiness,
    strengths,
    improvements,
    rootCauses,
    nextStage: readiness === "ready_for_next_round" ? "evaluate" : "diagnose",
  };
};
