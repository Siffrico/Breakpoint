import type { MissionEvaluation } from "@acme/validators";

export const MISSION_GUIDED_ATTEMPTS = 4;

export interface MissionEvaluationDraft {
  executionMet: boolean;
  executionFeedback: string;
  evidenceMet: boolean;
  evidenceFeedback: string;
  judgmentMet: boolean;
  judgmentFeedback: string;
  summary: string;
  nextStep: string;
}

/** This function takes one graded proof and attempt history, produces the durable gate decision, and never fails. */
export const decideMissionEvaluation = ({
  draft,
  attemptNumber,
}: {
  draft: MissionEvaluationDraft;
  attemptNumber: number;
}): MissionEvaluation => {
  const checks = [draft.executionMet, draft.evidenceMet, draft.judgmentMet];
  const checksMet = checks.filter(Boolean).length;
  const passed = checksMet === checks.length;

  return {
    checksMet,
    checksTotal: checks.length,
    passed,
    attemptNumber,
    summary: draft.summary,
    nextStep: passed ? null : draft.nextStep,
    criteria: [
      {
        key: "execution",
        met: draft.executionMet,
        feedback: draft.executionFeedback,
      },
      {
        key: "evidence",
        met: draft.evidenceMet,
        feedback: draft.evidenceFeedback,
      },
      {
        key: "judgment",
        met: draft.judgmentMet,
        feedback: draft.judgmentFeedback,
      },
    ],
  };
};
