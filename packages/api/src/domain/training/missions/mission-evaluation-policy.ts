import type { MissionEvaluation } from "@acme/validators";

export const MISSION_STANDARD_SCORE = 70;
export const MISSION_GROWTH_SCORE = 55;
export const MISSION_GROWTH_DELTA = 10;
export const MISSION_GUIDED_ATTEMPTS = 4;

export interface MissionEvaluationDraft {
  executionScore: number;
  executionFeedback: string;
  evidenceScore: number;
  evidenceFeedback: string;
  judgmentScore: number;
  judgmentFeedback: string;
  summary: string;
  nextStep: string;
}

/** This function takes one graded proof and attempt history, produces the durable gate decision, and never fails. */
export const decideMissionEvaluation = ({
  draft,
  attemptNumber,
  firstScore,
}: {
  draft: MissionEvaluationDraft;
  attemptNumber: number;
  firstScore: number | null;
}): MissionEvaluation => {
  const score =
    draft.executionScore + draft.evidenceScore + draft.judgmentScore;
  const hasEvidenceAcrossCriteria =
    draft.executionScore > 0 &&
    draft.evidenceScore > 0 &&
    draft.judgmentScore > 0;
  const standardPass = score >= MISSION_STANDARD_SCORE;
  const growthPass =
    !standardPass &&
    attemptNumber >= MISSION_GUIDED_ATTEMPTS &&
    firstScore !== null &&
    score >= MISSION_GROWTH_SCORE &&
    score - firstScore >= MISSION_GROWTH_DELTA &&
    hasEvidenceAcrossCriteria;
  const passed = standardPass || growthPass;

  return {
    score,
    passed,
    growthPass,
    attemptNumber,
    summary: draft.summary,
    nextStep: passed ? null : draft.nextStep,
    criteria: [
      {
        key: "execution",
        score: draft.executionScore,
        feedback: draft.executionFeedback,
      },
      {
        key: "evidence",
        score: draft.evidenceScore,
        feedback: draft.evidenceFeedback,
      },
      {
        key: "judgment",
        score: draft.judgmentScore,
        feedback: draft.judgmentFeedback,
      },
    ],
  };
};
