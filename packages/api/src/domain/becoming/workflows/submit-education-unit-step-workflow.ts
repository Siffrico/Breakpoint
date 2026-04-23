import { err, ok, type Result } from "../../../lib/result";
import type {
  EducationUnitAttemptSignals,
  SubmitEducationUnitStep,
} from "../types/becoming.types";
import type { PhaseResponseRecord, UnitContent } from "../types/becoming.types";
import {
  buildEducationDebrief,
  createEducationUnitConceptCorrection,
  getEducationUnitState,
} from "../policies/education-unit-state-policy";
import { educationUnitAiService } from "../services/education-unit-ai-service";
import { buildTutorContext, type TutorContext } from "../tutor";
import type { Memory } from "../../memory/types";

interface SubmitEducationUnitStepDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  listAttemptHistory: (sessionId: string) => Promise<
    Array<{
      title: string;
      score: number;
      readiness: string;
      finalArticulation: string | null;
      improvements: string[];
      failureTags: string[];
      nextStep: string;
    }>
  >;
  listMemories?: (userId: string) => Promise<Memory[]>;
  savePhaseResponse: (input: {
    unitContentId: string;
    sessionId: string;
    userId?: string | null;
    phase: PhaseResponseRecord["phase"];
    sequence: number;
    userResponse: string;
    aiResponse?: string | null;
    passed?: boolean | null;
    score?: number | null;
    metadata?: PhaseResponseRecord["metadata"];
  }) => Promise<PhaseResponseRecord | null>;
}

const getNextSequence = ({
  responses,
  phase,
}: {
  responses: PhaseResponseRecord[];
  phase: PhaseResponseRecord["phase"];
}) =>
  responses
    .filter((response) => response.phase === phase)
    .reduce(
      (highest, response) => Math.max(highest, response.sequence),
      -1,
    ) + 1;

const createResponseRecord = ({
  response,
  responseMode,
  confidence,
  latencyMs,
  signals = null,
}: {
  response: string;
  responseMode: SubmitEducationUnitStep["responseMode"];
  confidence: SubmitEducationUnitStep["confidence"];
  latencyMs?: number | null;
  signals?: EducationUnitAttemptSignals | null;
}) => ({
  response,
  responseMode,
  confidence,
  latencyMs: latencyMs ?? null,
  signals,
});

export const submitEducationUnitStepWorkflow = async ({
  sessionId,
  nodeId,
  step,
  response,
  responseMode,
  confidence,
  latencyMs,
  userId,
  deps,
}: SubmitEducationUnitStep & {
  userId?: string | null;
  deps: SubmitEducationUnitStepDependencies;
}): Promise<Result<ReturnType<typeof getEducationUnitState>>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  const trimmedResponse = response.trim();
  if (!trimmedResponse) {
    return err("A response is required.");
  }

  const phaseResponses = await deps.getPhaseResponses(unit.id, sessionId);
  const currentState = getEducationUnitState({
    unit,
    responses: phaseResponses,
  });
  let tutorContext: TutorContext | null = null;

  if (userId && deps.listMemories) {
    tutorContext = await buildTutorContext({
      userId,
      sessionId,
      stage:
        step === "initial_response"
          ? "attempt_diagnosis"
          : step === "mastery_check"
            ? "mastery_check"
            : step === "build_response"
              ? "build_review"
              : "revision_evaluation",
      curriculumStage: {
        unitId: unit.nodeId,
        unitTitle: unit.title,
        unitSummary: unit.summary,
        learningGoal: unit.learningGoal,
        activeStage: currentState.activeStage,
        retryCount: currentState.retryCount,
        unitPosition: null,
        clusterTitle: currentState.clusterBriefing?.briefingArc ?? null,
      },
      latestLearnerMessage: trimmedResponse,
      deps: {
        listMemories: () => deps.listMemories?.(userId) ?? Promise.resolve([]),
      },
    });
  }

  if (step === "initial_response") {
    if (currentState.activeStage !== "challenge") {
      return err("This unit is already past the initial response stage.");
    }

    const priorLearning = await deps.listAttemptHistory(sessionId);
    const conceptLayer = await educationUnitAiService.generateConceptLayer({
      unit,
      initialResponse: trimmedResponse,
      responseMode,
      confidence,
      retryCount: currentState.retryCount,
      priorLearning,
      tutorContext,
    });

    const nextState = {
      ...currentState,
      activeStage: "mastery_check" as const,
      initialResponse: createResponseRecord({
        response: trimmedResponse,
        responseMode,
        confidence,
        latencyMs,
        signals: conceptLayer.diagnosticGap.attemptSignals,
      }),
      diagnosticGap: conceptLayer.diagnosticGap,
      conceptCorrection: createEducationUnitConceptCorrection({
        unit,
        conceptName: conceptLayer.conceptName,
        conceptSummary: conceptLayer.conceptSummary,
      }),
      workedExamples: conceptLayer.workedExamples,
      priorKnowledgeBridge: conceptLayer.priorKnowledgeBridge,
      masteryCheck: conceptLayer.masteryCheck,
      masteryCheckResponse: null,
      transferChallenge: conceptLayer.transferChallenge,
      buildResponse: null,
      implementationReview: null,
      revisedBuildResponse: null,
      assessmentStatus: null,
      assessmentFeedback: null,
      score: null,
      strengths: [],
      improvements: [],
      nextStep: null,
    };

    await deps.savePhaseResponse({
      unitContentId: unit.id,
      sessionId,
      userId,
      phase: "loop_initial_response",
      sequence: getNextSequence({
        responses: phaseResponses,
        phase: "loop_initial_response",
      }),
      userResponse: trimmedResponse,
      aiResponse: conceptLayer.conceptSummary,
      metadata: {
        step,
        responseMode,
        confidence,
        latencyMs: latencyMs ?? null,
        signals: conceptLayer.diagnosticGap.attemptSignals,
        stateSnapshot: nextState,
      },
    });

    return ok(nextState);
  }

  if (step === "mastery_check") {
    if (currentState.activeStage !== "mastery_check" || !currentState.masteryCheck) {
      return err("This unit is not ready for a mastery check response.");
    }

    const outcome = await educationUnitAiService.evaluateMasteryCheck({
      unit,
      state: currentState,
      masteryCheckResponse: trimmedResponse,
      tutorContext,
    });

    const nextState =
      outcome.readiness === "ready_for_application"
        ? {
            ...currentState,
            activeStage: "transfer_challenge" as const,
            masteryCheckResponse: createResponseRecord({
              response: trimmedResponse,
              responseMode,
              confidence,
              latencyMs,
            }),
            strengths: outcome.strengths,
            improvements: outcome.improvements,
            nextStep: "Apply the concept in the new build scenario.",
          }
        : {
            ...currentState,
            activeStage: "mastery_check" as const,
            retryCount: currentState.retryCount + 1,
            masteryCheckResponse: createResponseRecord({
              response: trimmedResponse,
              responseMode,
              confidence,
              latencyMs,
            }),
            masteryCheck: outcome.replacementMasteryCheck ?? currentState.masteryCheck,
            assessmentStatus: "retry_concept" as const,
            assessmentFeedback: outcome.feedback,
            strengths: outcome.strengths,
            improvements: outcome.improvements,
            nextStep: "Tighten the concept, then answer the new mastery check.",
          };

    await deps.savePhaseResponse({
      unitContentId: unit.id,
      sessionId,
      userId,
      phase: "loop_mastery_check",
      sequence: getNextSequence({
        responses: phaseResponses,
        phase: "loop_mastery_check",
      }),
      userResponse: trimmedResponse,
      aiResponse: outcome.feedback,
      passed: outcome.readiness === "ready_for_application",
      metadata: {
        step,
        responseMode,
        confidence,
        latencyMs: latencyMs ?? null,
        stateSnapshot: nextState,
        ...(outcome.readiness === "ready_for_application"
          ? {}
          : { assessmentStatus: "retry_concept" as const }),
        feedback: outcome.feedback,
        evidenceAnchors: outcome.strengths,
      },
    });

    return ok(nextState);
  }

  if (step === "build_response") {
    if (currentState.activeStage !== "transfer_challenge" || !currentState.transferChallenge) {
      return err("This unit is not ready for a build response.");
    }

    const review = await educationUnitAiService.reviewBuildResponse({
      unit,
      state: currentState,
      buildResponse: trimmedResponse,
      tutorContext,
    });

    const nextState = {
      ...currentState,
      activeStage: "revision" as const,
      buildResponse: createResponseRecord({
        response: trimmedResponse,
        responseMode,
        confidence,
        latencyMs,
      }),
      implementationReview: review.implementationReview,
      assessmentStatus: null,
      assessmentFeedback: null,
      score: null,
      strengths: review.implementationReview.strengths,
      improvements: review.implementationReview.improvements,
      nextStep: review.implementationReview.requiredRevision,
    };

    await deps.savePhaseResponse({
      unitContentId: unit.id,
      sessionId,
      userId,
      phase: "loop_build_response",
      sequence: getNextSequence({
        responses: phaseResponses,
        phase: "loop_build_response",
      }),
      userResponse: trimmedResponse,
      aiResponse: review.implementationReview.summary,
      metadata: {
        step,
        responseMode,
        confidence,
        latencyMs: latencyMs ?? null,
        stateSnapshot: nextState,
        feedback: review.implementationReview.summary,
        evidenceAnchors: review.implementationReview.strengths,
      },
    });

    return ok(nextState);
  }

  if (currentState.activeStage !== "revision") {
    return err("This unit is not ready for a revision response.");
  }

  const outcome = await educationUnitAiService.evaluateRevision({
    unit,
    state: currentState,
    revisionResponse: trimmedResponse,
    tutorContext,
  });

  const nextState =
    outcome.assessmentStatus === "pass"
      ? {
          ...currentState,
          activeStage: "complete" as const,
          revisedBuildResponse: createResponseRecord({
            response: trimmedResponse,
            responseMode,
            confidence,
            latencyMs,
          }),
          assessmentStatus: outcome.assessmentStatus,
          assessmentFeedback: outcome.assessmentFeedback,
          score: outcome.score,
          strengths: outcome.strengths,
          improvements: outcome.improvements,
          nextStep: outcome.nextStep,
        }
      : outcome.assessmentStatus === "retry_concept"
        ? {
            ...currentState,
            activeStage: "mastery_check" as const,
            retryCount: currentState.retryCount + 1,
            revisedBuildResponse: createResponseRecord({
              response: trimmedResponse,
              responseMode,
              confidence,
              latencyMs,
            }),
            masteryCheck: outcome.retryMasteryCheck ?? currentState.masteryCheck,
            buildResponse: null,
            implementationReview: null,
            assessmentStatus: outcome.assessmentStatus,
            assessmentFeedback: outcome.assessmentFeedback,
            score: outcome.score,
            strengths: outcome.strengths,
            improvements: outcome.improvements,
            nextStep: outcome.nextStep,
          }
        : {
            ...currentState,
            activeStage: "transfer_challenge" as const,
            retryCount: currentState.retryCount + 1,
            revisedBuildResponse: createResponseRecord({
              response: trimmedResponse,
              responseMode,
              confidence,
              latencyMs,
            }),
            transferChallenge:
              outcome.retryTransferChallenge ?? currentState.transferChallenge,
            buildResponse: null,
            implementationReview: null,
            assessmentStatus: outcome.assessmentStatus,
            assessmentFeedback: outcome.assessmentFeedback,
            score: outcome.score,
            strengths: outcome.strengths,
            improvements: outcome.improvements,
            nextStep: outcome.nextStep,
          };

  const debrief = buildEducationDebrief({
    state: nextState,
  });

  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "loop_revision",
    sequence: getNextSequence({
      responses: phaseResponses,
      phase: "loop_revision",
    }),
    userResponse: trimmedResponse,
    aiResponse: outcome.assessmentFeedback,
    passed: outcome.assessmentStatus === "pass",
    score: outcome.score,
    metadata: {
      step,
      responseMode,
      confidence,
      latencyMs: latencyMs ?? null,
      stateSnapshot: nextState,
      assessmentStatus: outcome.assessmentStatus,
      feedback: outcome.assessmentFeedback,
      evidenceAnchors: debrief.strengths,
    },
  });

  return ok(nextState);
};
