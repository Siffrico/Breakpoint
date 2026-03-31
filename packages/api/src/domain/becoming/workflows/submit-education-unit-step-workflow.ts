import { err, ok, type Result } from "../../../lib/result";
import type { SubmitEducationUnitStep } from "../types/becoming.types";
import type { PhaseResponseRecord, UnitContent } from "../types/becoming.types";
import {
  buildEducationDebrief,
  createEducationUnitConcept,
  getEducationUnitState,
} from "../policies/education-unit-state-policy";
import { educationUnitAiService } from "../services/education-unit-ai-service";

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

  if (step === "attempt") {
    if (currentState.currentStep !== "scenario") {
      return err("This unit is already past the attempt step.");
    }

    const priorLearning = await deps.listAttemptHistory(sessionId);
    const teachPack = await educationUnitAiService.generateTeachPack({
      unit,
      attemptResponse: trimmedResponse,
      responseMode,
      confidence,
      loopCount: currentState.loopCount,
      priorLearning,
    });

    const nextState = {
      ...currentState,
      currentStep: "evaluate" as const,
      concept: createEducationUnitConcept({
        unit,
        conceptName: teachPack.conceptName,
        conceptSummary: teachPack.conceptSummary,
      }),
      attempt: {
        response: trimmedResponse,
        responseMode,
        confidence,
        latencyMs: latencyMs ?? null,
        signals: teachPack.attemptSignals,
      },
      teachExamples: teachPack.teachExamples,
      reconnectBridge: teachPack.reconnectBridge,
      evaluation: teachPack.evaluation,
      result: null,
      resultFeedback: null,
      score: null,
      strengths: [],
      improvements: [],
      nextStep: null,
    };

    await deps.savePhaseResponse({
      unitContentId: unit.id,
      sessionId,
      userId,
      phase: "sactre_attempt",
      sequence: getNextSequence({
        responses: phaseResponses,
        phase: "sactre_attempt",
      }),
      userResponse: trimmedResponse,
      aiResponse: teachPack.conceptSummary,
      metadata: {
        step,
        responseMode,
        confidence,
        latencyMs: latencyMs ?? null,
        signals: teachPack.attemptSignals,
        stateSnapshot: nextState,
      },
    });

    return ok(nextState);
  }

  if (currentState.currentStep !== "evaluate" || !currentState.evaluation) {
    return err("This unit is not ready for evaluation yet.");
  }

  const outcome = await educationUnitAiService.evaluateTransfer({
    unit,
    state: currentState,
    evaluationResponse: trimmedResponse,
  });

  const nextState =
    outcome.result === "pass"
      ? {
          ...currentState,
          currentStep: "complete" as const,
          result: outcome.result,
          resultFeedback: outcome.feedback,
          score: outcome.score,
          strengths: outcome.strengths,
          improvements: outcome.improvements,
          nextStep: outcome.nextStep,
        }
      : outcome.result === "gap"
        ? {
            ...currentState,
            currentStep: "scenario" as const,
            loopCount: currentState.loopCount + 1,
            scenario: outcome.retryScenario ?? currentState.scenario,
            attempt: null,
            result: outcome.result,
            resultFeedback: outcome.feedback,
            score: outcome.score,
            strengths: outcome.strengths,
            improvements: outcome.improvements,
            nextStep: outcome.nextStep,
          }
        : {
            ...currentState,
            currentStep: "evaluate" as const,
            loopCount: currentState.loopCount + 1,
            teachExamples: outcome.simplerExample
              ? [outcome.simplerExample, ...currentState.teachExamples.slice(0, 2)]
              : currentState.teachExamples,
            evaluation: outcome.retryScenario ?? currentState.evaluation,
            result: outcome.result,
            resultFeedback: outcome.feedback,
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
    phase: "sactre_evaluate",
    sequence: getNextSequence({
      responses: phaseResponses,
      phase: "sactre_evaluate",
    }),
    userResponse: trimmedResponse,
    aiResponse: outcome.feedback,
    passed: outcome.result === "pass",
    score: outcome.score,
    metadata: {
      step,
      responseMode,
      confidence,
      latencyMs: latencyMs ?? null,
      stateSnapshot: nextState,
      evaluationResult: outcome.result,
      feedback: outcome.feedback,
      evidenceAnchors: debrief.strengths,
    },
  });

  return ok(nextState);
};
