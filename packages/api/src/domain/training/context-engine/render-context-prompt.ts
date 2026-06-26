import type { WorkspaceTurnRuntime } from "../workspace-ai/stage-runtime";
import type { WorkspaceContextEnvelope } from "./schemas";

export const renderWorkspaceContextPrompt = (
  envelope: WorkspaceContextEnvelope,
  runtime?: WorkspaceTurnRuntime,
): string => `Workspace context envelope

## Learner
Target identity: ${envelope.learner.targetIdentity}
Durable memory:
${formatList(envelope.learner.durableMemory)}
Recurring failure patterns:
${formatList(envelope.learner.recurringFailurePatterns)}
Preferences:
${formatList(envelope.learner.preferences)}
Rating snapshot: ${envelope.learner.ratingSnapshot ?? "Not rated yet"}
${formatProgressSummary(envelope)}
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
${formatStepInstruction(runtime)}

## Evidence
Latest learner message: ${envelope.evidence.latestLearnerMessage}
Most relevant failure: ${envelope.evidence.mostRelevantFailure ?? "None selected"}
Strongest prior success: ${envelope.evidence.strongestPriorSuccess ?? "None selected"}
Unresolved pattern: ${envelope.evidence.unresolvedPattern ?? "None selected"}

${formatPromptShownToLearner(envelope)}
${formatDifficultyDirective(envelope)}
## Recent transcript
${formatList(envelope.evidence.recentTranscript)}

## Output contract
Move: ${envelope.outputContract.move}
Maximum words: ${envelope.outputContract.maxWords}
Must do:
${formatList(envelope.outputContract.mustDo)}
Must not do:
${formatList(envelope.outputContract.mustNotDo)}`;

export const renderWorkspaceStageContextPrompt = ({
  envelope,
  runtime,
}: {
  envelope: WorkspaceContextEnvelope;
  runtime: WorkspaceTurnRuntime;
}): string => {
  if (runtime.contextMode === "evaluator") {
    return renderEvaluatorContextPrompt(envelope, runtime);
  }

  return renderWorkspaceContextPrompt(envelope, runtime);
};

const renderEvaluatorContextPrompt = (
  envelope: WorkspaceContextEnvelope,
  runtime: WorkspaceTurnRuntime,
): string => `Evaluation context envelope

## Runtime
Prompt kind: ${runtime.promptKind}
Model purpose: ${runtime.modelPurpose}
Education stage: ${envelope.state.educationStage ?? "none"}
Move: ${envelope.outputContract.move}
${formatStepInstruction(runtime)}

## Evaluation plan policy
Pick the mode from the topic's actual mastery signal, not generic difficulty.
- intuition_sprint: mastery means spotting the governing pattern quickly across varied surfaces.
- deep_reasoning: mastery means building, deriving, proving, planning, or reasoning through linked steps.
- standard: mastery needs both but neither dominates.

Mode defaults enforced by code:
- intuition_sprint: 3 scenarios, 30-60 seconds each.
- standard: 2 scenarios, 300 seconds each.
- deep_reasoning: 1 scenario, 600 seconds.
- after a failed evaluation, retries use 1 scenario with the same mode timing until pass or repair.

Active plan: ${formatEvaluationPlan(envelope)}
Timing evidence for latest learner answer: ${formatAttemptTiming(envelope)}
Private scenario evaluation contract:
${formatScenarioEvaluationContract(envelope)}

## Unit target
Title: ${envelope.unit.title}
Learning goal: ${envelope.unit.learningGoal}
Summary: ${envelope.unit.summary}
Why it matters: ${envelope.unit.whyItMatters}
Seed scenario: ${envelope.unit.seedScenario}
Focus areas: ${formatInline(envelope.unit.focusAreas)}
${formatProgressSummary(envelope)}
Rating snapshot: ${envelope.learner.ratingSnapshot ?? "Not rated yet"}
## Learner answer to evaluate
${envelope.evidence.latestLearnerMessage}

${formatPromptShownToLearner(envelope)}
${formatDifficultyDirective(envelope)}
## Evidence allowed for calibration
Most relevant prior failure: ${envelope.evidence.mostRelevantFailure ?? "None selected"}
Strongest prior success: ${envelope.evidence.strongestPriorSuccess ?? "None selected"}
Unresolved pattern: ${envelope.evidence.unresolvedPattern ?? "None selected"}

## Minimal teaching transcript
${formatList(envelope.evidence.recentTranscript)}

## Evaluator contract
Maximum words: ${envelope.outputContract.maxWords}
Must do:
${formatList([
  ...envelope.outputContract.mustDo,
  "Score only evidence visible in the learner answer and allowed calibration evidence.",
  "Grade against the private scenario evaluation contract when it is present; do not reconstruct alternate criteria.",
  "Do not infer improvement from the teacher's intent or warmth.",
  "If repair is needed, route to the narrowest prior stage that can fix the missing mechanism.",
])}
Must not do:
${formatList([
  ...envelope.outputContract.mustNotDo,
  "Do not reward fluency without cited evidence.",
  "Do not grade the teacher or the curriculum.",
])}`;

const formatList = (items: string[]): string =>
  items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";

const formatStepInstruction = (runtime?: WorkspaceTurnRuntime): string =>
  runtime?.mode === "education_unit"
    ? `Step instruction: ${runtime.instruction}\nVerdict field to return: ${runtime.verdictField}`
    : "";

const formatInline = (items: string[]): string =>
  items.length > 0 ? items.join("; ") : "None";

const formatEvaluationPlan = (envelope: WorkspaceContextEnvelope): string => {
  const plan = envelope.evaluationPlan;
  if (!plan) return "None selected yet.";

  return `${plan.mode}; scenarios=${plan.scenarioCount}; timeLimit=${plan.timeLimitSeconds}s; feedback=${plan.feedbackMode}; reason=${plan.reason}`;
};

const formatAttemptTiming = (envelope: WorkspaceContextEnvelope): string => {
  const timing = envelope.attemptTiming;
  if (!timing) return "No timing submitted for this turn.";

  return `elapsed=${timing.elapsedSeconds}s; limit=${timing.timeLimitSeconds}s; overrun=${timing.overrunSeconds}s; overTime=${timing.wasOverTime}; paused=${timing.pausedSeconds ?? 0}s`;
};

const formatScenarioEvaluationContract = (
  envelope: WorkspaceContextEnvelope,
): string => {
  const contract = envelope.scenarioEvaluationContract;
  if (!contract) return "None stored. Use the unit target conservatively.";

  return JSON.stringify(contract, null, 2);
};

const formatPosition = (envelope: WorkspaceContextEnvelope): string => {
  if (envelope.curriculum.currentUnitIndex == null) {
    return `unknown of ${envelope.curriculum.totalUnits}`;
  }

  return `${envelope.curriculum.currentUnitIndex} of ${envelope.curriculum.totalUnits}`;
};

const formatProgressSummary = (envelope: WorkspaceContextEnvelope): string => {
  if (!envelope.learner.progressSummary) return "";

  return `
## Progress so far
Memory of earlier units in this project (recent units appear verbatim below):
${envelope.learner.progressSummary}
`;
};

const formatPromptShownToLearner = (
  envelope: WorkspaceContextEnvelope,
): string => {
  if (!envelope.promptShownToLearner) return "";

  return `## Prompt shown to learner
${envelope.promptShownToLearner.helper ? `Helper: ${envelope.promptShownToLearner.helper}\n` : ""}${envelope.promptShownToLearner.prompt}

`;
};

const formatDifficultyDirective = (
  envelope: WorkspaceContextEnvelope,
): string => {
  if (!envelope.difficultyDirective) return "";

  return `${envelope.difficultyDirective.promptBlock}

`;
};
