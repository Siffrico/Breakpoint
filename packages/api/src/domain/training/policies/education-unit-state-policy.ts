import type {
  EducationUnitConceptCorrection,
  EducationUnitState,
} from "@acme/validators";
import { EducationUnitStateSchema } from "@acme/validators";

import type { PhaseResponseRecord, UnitContent } from "../types/training.types";

const toConceptId = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "core_concept";

const getLatestStateSnapshot = (responses: PhaseResponseRecord[]) => {
  const latest = [...responses]
    .reverse()
    .find((response) => response.metadata?.stateSnapshot);

  if (!latest?.metadata?.stateSnapshot) {
    return null;
  }

  return (
    EducationUnitStateSchema.safeParse(latest.metadata.stateSnapshot).data ??
    null
  );
};

export const createInitialEducationUnitState = ({
  unit,
}: {
  unit: UnitContent;
}): EducationUnitState => {
  if (!unit.buildContent) {
    throw new Error("Unit teaching content is missing.");
  }
  return EducationUnitStateSchema.parse({
    id: unit.id,
    nodeId: unit.nodeId,
    title: unit.title,
    summary: unit.summary,
    whyItMatters: unit.whyItMatters,
    learningGoal: unit.learningGoal,
    clusterArcFrame: unit.clusterArcFrame,
    clusterBriefing: unit.clusterBriefing,
    activeStage: "challenge",
    retryCount: 0,
    challenge: {
      title: unit.scenario.title,
      prompt: unit.buildContent,
      helper: null,
      responseMode: "free_response",
      options: null,
    },
    initialResponse: null,
    diagnosticGap: null,
    conceptCorrection: null,
    workedExamples: [],
    priorKnowledgeBridge: null,
    masteryCheck: null,
    masteryCheckResponse: null,
    transferChallenge: null,
    buildResponse: null,
    implementationReview: null,
    revisedBuildResponse: null,
    assessmentStatus: null,
    assessmentFeedback: null,
    score: null,
    strengths: [],
    improvements: [],
    nextStep: null,
  });
};

export const getEducationUnitState = ({
  unit,
  responses,
}: {
  unit: UnitContent;
  responses: PhaseResponseRecord[];
}): EducationUnitState =>
  getLatestStateSnapshot(responses) ??
  createInitialEducationUnitState({ unit });

export const createEducationUnitConceptCorrection = ({
  unit,
  conceptName,
  conceptSummary,
}: {
  unit: UnitContent;
  conceptName?: string | null;
  conceptSummary?: string | null;
}): EducationUnitConceptCorrection => ({
  id: toConceptId(conceptName?.trim() ?? unit.title),
  name: conceptName?.trim() ?? unit.title,
  summary:
    conceptSummary?.trim() ??
    "This unit sharpens the concept the learner needs next.",
});

export const buildEducationDebrief = ({
  state,
}: {
  state: EducationUnitState;
}) => ({
  seedResponse: state.initialResponse?.response ?? "",
  finalArticulation:
    state.assessmentFeedback ??
    state.conceptCorrection?.summary ??
    "You advanced the concept enough to move forward.",
  growthDimensions:
    state.strengths.length > 0
      ? state.strengths
      : ["conceptual clarity", "transfer", "implementation precision"],
  score: state.score ?? (state.assessmentStatus === "pass" ? 86 : 64),
  readiness:
    state.assessmentStatus === "pass"
      ? ("ready_for_next_unit" as const)
      : state.assessmentStatus === "retry_concept"
        ? ("needs_repair" as const)
        : ("developing" as const),
  strengths:
    state.strengths.length > 0
      ? state.strengths
      : ["Moved beyond a first-guess interpretation."],
  improvements:
    state.improvements.length > 0
      ? state.improvements
      : ["Make the underlying mechanism more explicit."],
  failureTags:
    state.assessmentStatus === "pass"
      ? []
      : [
          state.diagnosticGap?.attemptSignals.misconceptionDirection ??
            "concept_gap",
        ],
  nextStep:
    state.nextStep ??
    (state.assessmentStatus === "pass"
      ? "Advance to the next concept."
      : "Retry the same concept with tighter reasoning."),
});
