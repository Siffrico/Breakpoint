import type { WorkspaceContextEnvelope } from "./schemas";

export const renderWorkspaceContextPrompt = (
  envelope: WorkspaceContextEnvelope,
): string => `Workspace context envelope

## Learner
Target identity: ${envelope.learner.targetIdentity}
Durable memory:
${formatList(envelope.learner.durableMemory)}
Recurring failure patterns:
${formatList(envelope.learner.recurringFailurePatterns)}
Preferences:
${formatList(envelope.learner.preferences)}

## Curriculum
Title: ${envelope.curriculum.title}
Summary: ${envelope.curriculum.summary}
Position: ${formatPosition(envelope)}

## Active unit
Title: ${envelope.unit.title}
Learning goal: ${envelope.unit.learningGoal}
Summary: ${envelope.unit.summary}
Why it matters: ${envelope.unit.whyItMatters}
Seed scenario: ${envelope.unit.seedScenario}
Focus areas: ${formatInline(envelope.unit.focusAreas)}

## State
Mode: ${envelope.state.mode}
Education stage: ${envelope.state.educationStage ?? "none"}
Retry count in this unit: ${envelope.state.retryCount}

## Evidence
Latest learner message: ${envelope.evidence.latestLearnerMessage}
Most relevant failure: ${envelope.evidence.mostRelevantFailure ?? "None selected"}
Strongest prior success: ${envelope.evidence.strongestPriorSuccess ?? "None selected"}
Unresolved pattern: ${envelope.evidence.unresolvedPattern ?? "None selected"}

${formatPromptShownToLearner(envelope)}
## Recent transcript
${formatList(envelope.evidence.recentTranscript)}

## Output contract
Move: ${envelope.outputContract.move}
Maximum words: ${envelope.outputContract.maxWords}
Must do:
${formatList(envelope.outputContract.mustDo)}
Must not do:
${formatList(envelope.outputContract.mustNotDo)}`;

const formatList = (items: string[]): string =>
  items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";

const formatInline = (items: string[]): string =>
  items.length > 0 ? items.join("; ") : "None";

const formatPosition = (envelope: WorkspaceContextEnvelope): string => {
  if (envelope.curriculum.currentUnitIndex == null) {
    return `unknown of ${envelope.curriculum.totalUnits}`;
  }

  return `${envelope.curriculum.currentUnitIndex} of ${envelope.curriculum.totalUnits}`;
};

const formatPromptShownToLearner = (
  envelope: WorkspaceContextEnvelope,
): string => {
  if (!envelope.promptShownToLearner) return "";

  return `## Prompt shown to learner
${envelope.promptShownToLearner.helper ? `Helper: ${envelope.promptShownToLearner.helper}\n` : ""}${envelope.promptShownToLearner.prompt}

`;
};
