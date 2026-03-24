import { err, ok, type Result } from "../../../lib/result";
import { evaluatePracticeResponse } from "../evaluate-practice-response";
import {
  allPriorPracticesPassed,
  getPracticeAttemptCount,
  getPracticeResponses,
  getSeedResponse,
} from "./forge-workflow-helpers";
import type {
  PhaseResponseRecord,
  PracticeEvaluation,
  UnitContent,
} from "../types/becoming.types";

interface SubmitPracticeDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
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

export const submitPracticeWorkflow = async ({
  nodeId,
  sessionId,
  sequence,
  response,
  userId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  sequence: number;
  response: string;
  userId?: string | null;
  deps: SubmitPracticeDependencies;
}): Promise<Result<PracticeEvaluation>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  if (!unit.buildContent || !unit.practicePrompts) {
    return err("Submit the seed before starting practice.");
  }

  if (sequence < 0 || sequence > 2) {
    return err("Practice sequence is out of range.");
  }

  const trimmedResponse = response.trim();
  if (trimmedResponse.length < 30) {
    return err("Write a more complete practice response.");
  }

  const phaseResponses = await deps.getPhaseResponses(unit.id, sessionId);
  if (!getSeedResponse(phaseResponses)) {
    return err("Capture the seed response before starting practice.");
  }

  if (!allPriorPracticesPassed({ responses: phaseResponses, sequence })) {
    return err("Pass earlier practice rounds before unlocking this one.");
  }

  const existingPractice = getPracticeResponses(phaseResponses).find(
    (item) => item.sequence === sequence,
  );
  if (existingPractice?.passed) {
    return ok({
      passed: true,
      feedback: existingPractice.aiResponse ?? "Practice round already passed.",
    });
  }

  const attempts = getPracticeAttemptCount(existingPractice);
  if (attempts >= 3) {
    return err("Practice retry limit reached for this round.");
  }

  let evaluation;
  try {
    evaluation = await evaluatePracticeResponse({
      practicePrompt: unit.practicePrompts[sequence]!,
      userResponse: trimmedResponse,
      unitTitle: unit.title,
      buildContent: unit.buildContent,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to evaluate the practice response.",
    );
  }

  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "practice",
    sequence,
    userResponse: trimmedResponse,
    aiResponse: evaluation.feedback,
    passed: evaluation.passed,
    metadata: { attempts: attempts + 1, feedback: evaluation.feedback },
  });

  return ok(evaluation);
};
