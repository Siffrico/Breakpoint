import { z } from "zod/v4";
import {
  EducationUnitStateSchema
  
  
} from "@acme/validators";
import type {EducationUnitConceptCorrection, EducationUnitState} from "@acme/validators";

import type { PhaseResponseRecord, UnitContent } from "../types/training.types";

const toConceptId = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "core_concept";

const looksLikeLegacySeedPrompt = (prompt: string) =>
  /what do you (currently )?think|write what you|define|how do you believe/i.test(
    prompt,
  );

const LegacyEducationUnitStateSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  learningGoal: z.string().min(1).optional(),
  clusterArcFrame: z.string().nullable(),
  clusterBriefing: z.unknown().nullable(),
  currentStep: z.enum(["scenario", "evaluate", "complete"]),
  loopCount: z.number().int().min(0),
  concept: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      summary: z.string().min(1),
    })
    .nullable(),
  scenario: z.object({
    title: z.string().min(1),
    prompt: z.string().min(1),
    helper: z.string().nullable(),
    responseMode: z.enum(["free_response", "multiple_choice"]),
    options: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
        }),
      )
      .nullable(),
  }),
  attempt: z
    .object({
      response: z.string().min(1),
      responseMode: z.enum(["free_response", "multiple_choice"]),
      confidence: z.enum(["low", "medium", "high"]),
      latencyMs: z.number().int().min(0).nullable(),
      signals: z
        .object({
          correctnessBand: z.enum(["strong", "close", "partial", "off_track"]),
          misconceptionDirection: z.string().min(1),
          reasoningStyle: z.string().min(1),
        })
        .nullable(),
    })
    .nullable(),
  teachExamples: z.array(
    z.object({
      label: z.string().min(1),
      content: z.string().min(1),
    }),
  ),
  reconnectBridge: z.string().nullable(),
  evaluation: z
    .object({
      title: z.string().min(1),
      prompt: z.string().min(1),
      helper: z.string().nullable(),
      responseMode: z.enum(["free_response", "multiple_choice"]),
      options: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
          }),
        )
        .nullable(),
    })
    .nullable(),
  result: z.enum(["pass", "gap", "lost"]).nullable(),
  resultFeedback: z.string().nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  strengths: z.array(z.string().min(1)),
  improvements: z.array(z.string().min(1)),
  nextStep: z.string().nullable(),
});

const mapLegacySnapshot = (
  snapshot: z.infer<typeof LegacyEducationUnitStateSchema>,
): EducationUnitState =>
  EducationUnitStateSchema.parse({
    id: snapshot.id,
    nodeId: snapshot.nodeId,
    title: snapshot.title,
    summary: snapshot.summary,
    whyItMatters: snapshot.whyItMatters,
    learningGoal: snapshot.learningGoal ?? snapshot.summary,
    clusterArcFrame: snapshot.clusterArcFrame,
    clusterBriefing: snapshot.clusterBriefing,
    activeStage:
      snapshot.currentStep === "scenario"
        ? "challenge"
        : snapshot.currentStep === "evaluate"
          ? "transfer_challenge"
          : "complete",
    retryCount: snapshot.loopCount,
    challenge: snapshot.scenario,
    initialResponse: snapshot.attempt,
    diagnosticGap: snapshot.attempt?.signals
      ? {
          predictionError:
            snapshot.attempt.signals.correctnessBand === "strong"
              ? "Your first pass had the right shape, but it still needed a more explicit mechanism."
              : "Your first pass leaned on intuition, but the causal model stayed too fuzzy to transfer cleanly.",
          whatHeldUp:
            snapshot.attempt.signals.reasoningStyle ||
            "You were pointing toward a useful signal.",
          whatBroke:
            snapshot.attempt.signals.misconceptionDirection ||
            "The mechanism stayed underspecified.",
          attemptSignals: snapshot.attempt.signals,
        }
      : null,
    conceptCorrection: snapshot.concept,
    workedExamples: snapshot.teachExamples,
    priorKnowledgeBridge: snapshot.reconnectBridge,
    masteryCheck: null,
    masteryCheckResponse: null,
    transferChallenge: snapshot.evaluation,
    buildResponse: null,
    implementationReview: null,
    revisedBuildResponse: null,
    assessmentStatus:
      snapshot.result === "pass"
        ? "pass"
        : snapshot.result === "lost"
          ? "retry_concept"
          : snapshot.result === "gap"
            ? "retry_application"
            : null,
    assessmentFeedback: snapshot.resultFeedback,
    score: snapshot.score,
    strengths: snapshot.strengths,
    improvements: snapshot.improvements,
    nextStep: snapshot.nextStep,
  });

const getLatestStateSnapshot = (responses: PhaseResponseRecord[]) => {
  const latest = [...responses]
    .reverse()
    .find((response) => response.metadata?.stateSnapshot);

  if (!latest?.metadata?.stateSnapshot) {
    return null;
  }

  const nextState = EducationUnitStateSchema.safeParse(
    latest.metadata.stateSnapshot,
  );
  if (nextState.success) {
    return nextState.data;
  }

  const legacyState = LegacyEducationUnitStateSchema.safeParse(
    latest.metadata.stateSnapshot,
  );
  if (legacyState.success) {
    return mapLegacySnapshot(legacyState.data);
  }

  return null;
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
    learningGoal: unit.learningGoal,
    clusterArcFrame: unit.clusterArcFrame,
    clusterBriefing: unit.clusterBriefing,
    activeStage: "challenge",
    retryCount: 0,
    challenge: {
      title: unit.scenario.title,
      prompt: unit.seedPrompt,
      helper: unit.seedHint,
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
      : [state.diagnosticGap?.attemptSignals.misconceptionDirection ?? "concept_gap"],
  nextStep:
    state.nextStep ??
    (state.assessmentStatus === "pass"
      ? "Advance to the next concept."
      : "Retry the same concept with tighter reasoning."),
});
