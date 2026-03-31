import { err, ok, type Result } from "../../../lib/result";
import { getTeachbackObjection, reviewTeachback } from "../orchestration/failure-flow";
import {
  allPracticeRoundsPassed,
  buildTeachbackTranscript,
  getLatestTeachbackRound,
  getPracticeResponses,
  getTeachbackResponses,
} from "./forge-workflow-helpers";
import type {
  PhaseResponseRecord,
  TeachbackMessage,
  TeachbackRoundResult,
  UnitContent,
} from "../types/becoming.types";

interface SubmitTeachbackDependencies {
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

export const submitTeachbackWorkflow = async ({
  nodeId,
  sessionId,
  round,
  response,
  userId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  round: number;
  response: string;
  userId?: string | null;
  deps: SubmitTeachbackDependencies;
}): Promise<Result<TeachbackRoundResult>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  if (round < 1 || round > 3) {
    return err("Teach-back round must be between 1 and 3.");
  }

  const trimmedResponse = response.trim();
  if (trimmedResponse.length < 50) {
    return err("Give a fuller teach-back answer before submitting.");
  }

  const phaseResponses = await deps.getPhaseResponses(unit.id, sessionId);
  if (!allPracticeRoundsPassed(phaseResponses)) {
    return err("Pass all practice rounds before starting the teach-back.");
  }

  const lastRound = getLatestTeachbackRound(phaseResponses);
  if (round !== lastRound + 1) {
    return err("Teach-back rounds must be completed in order.");
  }

  if (getTeachbackResponses(phaseResponses).some((item) => item.sequence === round)) {
    return err("This teach-back round has already been submitted.");
  }

  const baseTranscript = buildTeachbackTranscript({
    unitContent: unit,
    teachbackResponses: phaseResponses,
  });
  const transcript: TeachbackMessage[] = [
    ...baseTranscript,
    { role: "user", content: trimmedResponse, round },
  ];
  if (round < 3) {
    let nextReply;
    try {
      nextReply = await Promise.resolve(
        getTeachbackObjection({
          unitContent: unit,
          round: round + 1,
        }),
      );
    } catch (error) {
      return err(
        error instanceof Error
          ? error.message
          : "Failed to generate the next teach-back objection.",
      );
    }

    await deps.savePhaseResponse({
      unitContentId: unit.id,
      sessionId,
      userId,
      phase: "teachback",
      sequence: round,
      userResponse: trimmedResponse,
      aiResponse: nextReply.studentReply,
      passed: false,
    });

    return ok({
      studentReply: nextReply.studentReply,
      passed: false,
      round,
      score: null,
      feedback: null,
    });
  }

  let finalGrade;
  try {
    const review = await reviewTeachback({
      unitContent: unit,
      practiceResponses: getPracticeResponses(phaseResponses).map((item) => ({
        sequence: item.sequence,
        response: item.userResponse,
        feedback: item.aiResponse ?? "",
        passed: item.passed ?? false,
      })),
      teachbackTranscript: transcript,
    });

    finalGrade = review.verdict;
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Failed to grade the teach-back.",
    );
  }

  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "teachback",
    sequence: round,
    userResponse: trimmedResponse,
    aiResponse: finalGrade.feedback,
    passed: finalGrade.passed,
    score: finalGrade.score,
    metadata: { feedback: finalGrade.feedback },
  });

  return ok({
    studentReply: null,
    passed: finalGrade.passed,
    round,
    score: finalGrade.score,
    feedback: finalGrade.feedback,
  });
};
