import { err, ok, type Result } from "../../../lib/result";
import { gradeGhostResponse } from "../grade-ghost-response";
import { getGhostResponses } from "./forge-workflow-helpers";
import type {
  GhostEvaluation,
  PhaseResponseRecord,
  UnitContent,
} from "../types/becoming.types";

interface SubmitGhostResponseDependencies {
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

export const submitGhostResponseWorkflow = async ({
  nodeId,
  sessionId,
  response,
  userId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  response: string;
  userId?: string | null;
  deps: SubmitGhostResponseDependencies;
}): Promise<Result<GhostEvaluation>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  const trimmedResponse = response.trim();
  if (trimmedResponse.length < 50) {
    return err("Write a fuller ghost response before submitting.");
  }

  const phaseResponses = await deps.getPhaseResponses(unit.id, sessionId);
  if (getGhostResponses(phaseResponses).some((item) => item.passed)) {
    return err("A passing ghost response already exists. Fetch the debrief.");
  }

  const latestIsolation = await deps.getLatestFailureIsolation(unit.id, sessionId);
  if (!latestIsolation) {
    return err("Fetch failure isolation before submitting a ghost response.");
  }

  if (latestIsolation.submitted) {
    return err("This ghost scenario has already been answered. Fetch a new one if needed.");
  }

  let evaluation;
  try {
    evaluation = await gradeGhostResponse({
      ghostScenario: latestIsolation.ghostScenario,
      gap: latestIsolation.gap,
      response: trimmedResponse,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to evaluate the ghost response.",
    );
  }

  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ghost",
    sequence: latestIsolation.sequence,
    userResponse: trimmedResponse,
    aiResponse: evaluation.feedback,
    passed: evaluation.passed,
    score: evaluation.score,
    metadata: {
      gap: latestIsolation.gap,
      ghostScenario: latestIsolation.ghostScenario,
    },
  });

  return ok(evaluation);
};
