import { err, ok, type Result } from "../../../lib/result";
import { reviewTeachback } from "../orchestration/failure-flow";
import { generateGhostReplay } from "../orchestration/ghost-flow";
import {
  buildTeachbackTranscript,
  getGhostResponses,
  getLatestGhostResponse,
  getLatestTeachbackResult,
  getPracticeResponses,
} from "./forge-workflow-helpers";
import type {
  FailureIsolationResult,
  PhaseResponseRecord,
  UnitContent,
} from "../types/becoming.types";

interface GetFailureIsolationDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  getLatestFailureIsolation: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<{
    gap: NonNullable<NonNullable<PhaseResponseRecord["metadata"]>["gap"]>;
    evidenceAnchors?: string[];
    repairTarget?: NonNullable<
      NonNullable<PhaseResponseRecord["metadata"]>["repairTarget"]
    >;
    ghostScenario: NonNullable<
      NonNullable<PhaseResponseRecord["metadata"]>["ghostScenario"]
    >;
    sequence: number;
    submitted: boolean;
  } | null>;
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

export const getFailureIsolationWorkflow = async ({
  nodeId,
  sessionId,
  userId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  userId?: string | null;
  deps: GetFailureIsolationDependencies;
}): Promise<Result<FailureIsolationResult>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  const phaseResponses = await deps.getPhaseResponses(unit.id, sessionId);
  const teachbackResult = getLatestTeachbackResult(phaseResponses);
  if (!teachbackResult) {
    return err("Complete the teach-back before requesting failure isolation.");
  }

  if (teachbackResult.passed) {
    return err("Failure isolation is only available after a failed teach-back.");
  }

  if (getGhostResponses(phaseResponses).some((response) => response.passed)) {
    return err("A ghost pass already exists. Fetch the debrief instead.");
  }

  const latestIsolation = await deps.getLatestFailureIsolation(unit.id, sessionId);
  if (latestIsolation && !latestIsolation.submitted) {
    return ok({
      gap: latestIsolation.gap,
      ghostScenario: latestIsolation.ghostScenario,
    });
  }

  const ghostResponses = getGhostResponses(phaseResponses);
  if (ghostResponses.length >= 5) {
    return err("Ghost scenario limit reached for this unit.");
  }

  const teachbackTranscript = buildTeachbackTranscript({
    unitContent: unit,
    teachbackResponses: phaseResponses,
  });
  const practiceResponses = getPracticeResponses(phaseResponses).map((response) => ({
    sequence: response.sequence,
    response: response.userResponse,
    feedback: response.aiResponse ?? "",
    passed: response.passed ?? false,
  }));

  let proveReview;
  try {
    proveReview = await reviewTeachback({
      unitContent: unit,
      practiceResponses,
      teachbackTranscript,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to isolate the learner's failure.",
    );
  }
  if (proveReview.verdict.passed) {
    return err("Failure isolation is only available after a failed teach-back.");
  }

  let repairStage;
  try {
    repairStage = await generateGhostReplay({
      unitContent: unit,
      practiceResponses,
      teachbackTranscript,
      proveReview,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate the ghost scenario.",
    );
  }
  const { gap, repairTarget, ghostScenario } = repairStage;

  const nextSequence = (getLatestGhostResponse(phaseResponses)?.sequence ?? -1) + 1;
  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ghost",
    sequence: nextSequence,
    userResponse: "",
    metadata: {
      gap,
      evidenceAnchors: proveReview.evidenceAnchors,
      repairTarget,
      ghostScenario,
    },
  });

  return ok({ gap, ghostScenario });
};
