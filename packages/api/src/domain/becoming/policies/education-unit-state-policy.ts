import {
  EducationUnitStateSchema,
  type EducationUnitConcept,
  type EducationUnitState,
} from "@acme/validators";

import type { PhaseResponseRecord, UnitContent } from "../types/becoming.types";

const toConceptId = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "core_concept";

const looksLikeLegacySeedPrompt = (prompt: string) =>
  /what do you (currently )?think|write what you|define|how do you believe/i.test(
    prompt,
  );

const getLatestStateSnapshot = (responses: PhaseResponseRecord[]) => {
  const latest = [...responses]
    .reverse()
    .find((response) => response.metadata?.stateSnapshot);

  if (!latest?.metadata?.stateSnapshot) {
    return null;
  }

  const parsed = EducationUnitStateSchema.safeParse(latest.metadata.stateSnapshot);
  return parsed.success ? parsed.data : null;
};

export const createInitialEducationUnitState = ({
  unit,
}: {
  unit: UnitContent;
}): EducationUnitState =>
  EducationUnitStateSchema.parse({
    id: unit.id,
    nodeId: unit.nodeId,
    title: unit.title,
    summary: unit.summary,
    whyItMatters: unit.whyItMatters,
    clusterArcFrame: unit.clusterArcFrame,
    clusterBriefing: unit.clusterBriefing,
    currentStep: "scenario",
    loopCount: 0,
    concept: null,
    scenario: {
      title: unit.scenario.title,
      prompt: unit.seedPrompt,
      helper: unit.seedHint,
      responseMode: "free_response",
      options: null,
    },
    attempt: null,
    teachExamples: [],
    reconnectBridge: null,
    evaluation: null,
    result: null,
    resultFeedback: null,
    score: null,
    strengths: [],
    improvements: [],
    nextStep: null,
  });

export const getEducationUnitState = ({
  unit,
  responses,
}: {
  unit: UnitContent;
  responses: PhaseResponseRecord[];
}): EducationUnitState =>
  getLatestStateSnapshot(responses) ?? createInitialEducationUnitState({ unit });

export const shouldRefreshLegacyEducationUnit = ({
  unit,
  responses,
}: {
  unit: UnitContent;
  responses: PhaseResponseRecord[];
}) =>
  responses.length === 0 &&
  (unit.buildContent != null ||
    unit.practicePrompts != null ||
    looksLikeLegacySeedPrompt(unit.seedPrompt));

export const createEducationUnitConcept = ({
  unit,
  conceptName,
  conceptSummary,
}: {
  unit: UnitContent;
  conceptName?: string | null;
  conceptSummary?: string | null;
}): EducationUnitConcept => ({
  id: toConceptId(conceptName?.trim() || unit.title),
  name: conceptName?.trim() || unit.title,
  summary:
    conceptSummary?.trim() ||
    "This unit sharpens the concept the learner needs next.",
});

export const buildEducationDebrief = ({
  state,
}: {
  state: EducationUnitState;
}) => ({
  seedResponse: state.attempt?.response ?? "",
  finalArticulation:
    state.resultFeedback ??
    state.concept?.summary ??
    "You advanced the concept enough to move forward.",
  growthDimensions:
    state.strengths.length > 0
      ? state.strengths
      : ["transfer", "calibration", "conceptual clarity"],
  score: state.score ?? (state.result === "pass" ? 84 : 62),
  readiness:
    state.result === "pass"
      ? ("ready_for_next_unit" as const)
      : state.result === "lost"
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
    state.result === "pass"
      ? []
      : [state.attempt?.signals?.misconceptionDirection ?? "concept_gap"],
  nextStep:
    state.nextStep ??
    (state.result === "pass"
      ? "Advance to the next concept."
      : "Retry the same concept with a different angle."),
});
