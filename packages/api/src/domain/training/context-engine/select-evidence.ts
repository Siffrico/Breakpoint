import type { PhaseResponseRecord, UnitContent } from "../types/training.types";
import type { WorkspaceAiMessage } from "../workspace-ai/types";
import { compactText, WORKSPACE_CONTEXT_BUDGET } from "./context-budget";

export interface SelectedWorkspaceEvidence {
  latestLearnerMessage: string;
  recentTranscript: string[];
  mostRelevantFailure: string | null;
  strongestPriorSuccess: string | null;
  unresolvedPattern: string | null;
  retryCount: number;
}

export const selectWorkspaceEvidence = ({
  unit,
  activeUnitResponses,
  allResponses,
  messages,
}: {
  unit: UnitContent;
  activeUnitResponses: PhaseResponseRecord[];
  allResponses: PhaseResponseRecord[];
  messages: WorkspaceAiMessage[];
}): SelectedWorkspaceEvidence => {
  const orderedActiveResponses = sortByCreatedAt(activeUnitResponses);
  const latestLearnerMessage =
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ??
    orderedActiveResponses.at(-1)?.userResponse ??
    unit.seedPrompt;
  const failedResponses = orderedActiveResponses.filter(isFailedResponse);
  const passedResponses = orderedActiveResponses.filter(isStrongResponse);
  const latestFailure = failedResponses.at(-1) ?? null;
  const strongestSuccess = pickStrongestResponse(passedResponses);

  return {
    latestLearnerMessage: compactText(
      latestLearnerMessage,
      WORKSPACE_CONTEXT_BUDGET.maxTranscriptChars,
    ),
    recentTranscript: formatRecentTranscript(messages),
    mostRelevantFailure: latestFailure
      ? formatResponseEvidence(latestFailure)
      : null,
    strongestPriorSuccess: strongestSuccess
      ? formatResponseEvidence(strongestSuccess)
      : null,
    unresolvedPattern: selectUnresolvedPattern({
      activeUnitResponses: orderedActiveResponses,
      allResponses,
    }),
    retryCount: failedResponses.length,
  };
};

const sortByCreatedAt = (responses: PhaseResponseRecord[]) =>
  responses
    .slice()
    .sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );

const isFailedResponse = (response: PhaseResponseRecord): boolean =>
  response.passed === false ||
  (response.score != null && response.score < 70) ||
  response.metadata?.assessmentStatus === "retry_concept" ||
  response.metadata?.assessmentStatus === "retry_application";

const isStrongResponse = (response: PhaseResponseRecord): boolean =>
  response.passed === true || (response.score != null && response.score >= 80);

const pickStrongestResponse = (responses: PhaseResponseRecord[]) =>
  responses
    .slice()
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))[0] ?? null;

const formatResponseEvidence = (response: PhaseResponseRecord): string =>
  compactText(
    [
      `phase=${response.phase}`,
      response.score == null ? null : `score=${response.score}`,
      response.passed == null ? null : `passed=${response.passed}`,
      response.metadata?.assessmentStatus
        ? `assessment=${response.metadata.assessmentStatus}`
        : null,
      response.metadata?.feedback
        ? `feedback=${response.metadata.feedback}`
        : null,
      response.metadata?.evidenceAnchors?.length
        ? `evidence=${response.metadata.evidenceAnchors.join("; ")}`
        : null,
      `learner=${response.userResponse}`,
    ]
      .filter((part): part is string => part != null && part.length > 0)
      .join(" | "),
    WORKSPACE_CONTEXT_BUDGET.maxEvidenceChars,
  );

const formatRecentTranscript = (messages: WorkspaceAiMessage[]): string[] =>
  messages
    .slice(-WORKSPACE_CONTEXT_BUDGET.recentTranscriptMessages)
    .map((message) =>
      compactText(
        `${message.role.toUpperCase()}: ${message.content}`,
        WORKSPACE_CONTEXT_BUDGET.maxTranscriptChars,
      ),
    );

const selectUnresolvedPattern = ({
  activeUnitResponses,
  allResponses,
}: {
  activeUnitResponses: PhaseResponseRecord[];
  allResponses: PhaseResponseRecord[];
}): string | null => {
  const activeGap = [...activeUnitResponses]
    .reverse()
    .find((response) => response.metadata?.gap)?.metadata?.gap;
  if (activeGap) {
    return compactText(
      `${activeGap.gapType}: ${activeGap.description} (${activeGap.whereItBroke})`,
      WORKSPACE_CONTEXT_BUDGET.maxEvidenceChars,
    );
  }

  const recentFailureTags = allResponses
    .slice()
    .reverse()
    .flatMap((response) => response.metadata?.evidenceAnchors ?? [])
    .slice(0, 4);
  if (recentFailureTags.length === 0) return null;

  return compactText(
    recentFailureTags.join("; "),
    WORKSPACE_CONTEXT_BUDGET.maxEvidenceChars,
  );
};
