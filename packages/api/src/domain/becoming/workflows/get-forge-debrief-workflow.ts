import { err, ok, type Result } from "../../../lib/result";
import { buildForgeDebrief } from "../build-forge-debrief";
import {
  buildTeachbackTranscript,
  getGhostResponses,
  getLatestTeachbackResult,
  getPracticeResponses,
  getSeedResponse,
} from "./forge-workflow-helpers";
import type {
  Debrief,
  PhaseResponseRecord,
  UnitContent,
} from "../types/becoming.types";

interface GetForgeDebriefDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  getTargetIdentity: (sessionId: string) => Promise<string | null>;
  getLatestAttemptByUnit: (
    sessionId: string,
    unitId: string,
  ) => Promise<{
    score: number;
    readiness: string;
    strengths: string[];
    improvements: string[];
    failureTags: string[];
    nextStep: string;
    seedResponse: string | null;
    finalArticulation: string | null;
    growthDimensions: string[] | null;
  } | null>;
  saveAttempt: (input: {
    sessionId: string;
    userId?: string | null;
    unitId: string;
    response: string;
    debrief: Debrief;
    seedResponse?: string | null;
    finalArticulation?: string | null;
    growthDimensions?: string[] | null;
  }) => Promise<unknown>;
  completeNode: (nodeId: string) => Promise<void>;
}

const deriveReadiness = ({
  score,
  teachbackPassed,
}: {
  score: number;
  teachbackPassed: boolean;
}): Debrief["readiness"] => {
  if (score >= 80 && teachbackPassed) {
    return "ready_for_next_unit";
  }

  if (score >= 60 || teachbackPassed) {
    return "developing";
  }

  return "needs_repair";
};

export const getForgeDebriefWorkflow = async ({
  nodeId,
  sessionId,
  userId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  userId?: string | null;
  deps: GetForgeDebriefDependencies;
}): Promise<Result<Debrief>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  const cachedAttempt = await deps.getLatestAttemptByUnit(sessionId, unit.id);
  if (
    cachedAttempt?.seedResponse &&
    cachedAttempt.finalArticulation &&
    cachedAttempt.growthDimensions
  ) {
    return ok({
      seedResponse: cachedAttempt.seedResponse,
      finalArticulation: cachedAttempt.finalArticulation,
      growthDimensions: cachedAttempt.growthDimensions,
      score: cachedAttempt.score,
      readiness: cachedAttempt.readiness as Debrief["readiness"],
      strengths: cachedAttempt.strengths,
      improvements: cachedAttempt.improvements,
      failureTags: cachedAttempt.failureTags,
      nextStep: cachedAttempt.nextStep,
    });
  }

  const phaseResponses = await deps.getPhaseResponses(unit.id, sessionId);
  const seedResponse = getSeedResponse(phaseResponses);
  if (!seedResponse) {
    return err("Seed response is missing for this unit.");
  }

  const teachbackResult = getLatestTeachbackResult(phaseResponses);
  if (!teachbackResult) {
    return err("Teach-back must be completed before the debrief is available.");
  }

  const teachbackPassed = teachbackResult.passed === true;
  const ghostPassed = getGhostResponses(phaseResponses).some(
    (response) => response.passed,
  );
  if (!teachbackPassed && !ghostPassed) {
    return err("Pass the teach-back or a ghost scenario before fetching the debrief.");
  }

  const targetIdentity = await deps.getTargetIdentity(sessionId);
  if (!targetIdentity) {
    return err("Target identity is missing.");
  }

  const teachbackTranscript = buildTeachbackTranscript({
    unitContent: unit,
    teachbackResponses: phaseResponses,
  });
  const practiceResponses = getPracticeResponses(phaseResponses).map(
    (response) => response.userResponse,
  );
  const ghostResponses = getGhostResponses(phaseResponses)
    .filter((response) => response.aiResponse != null)
    .map((response) => response.userResponse);

  let debrief;
  try {
    debrief = await buildForgeDebrief({
      seedResponse: seedResponse.userResponse,
      practiceResponses,
      teachbackTranscript,
      ghostResponses: ghostResponses.length > 0 ? ghostResponses : null,
      unitContent: unit,
      targetIdentity,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate the Forge debrief.",
    );
  }

  const normalizedDebrief: Debrief = {
    ...debrief,
    readiness: deriveReadiness({
      score: debrief.score,
      teachbackPassed,
    }),
  };

  await deps.saveAttempt({
    sessionId,
    userId,
    unitId: unit.id,
    response: normalizedDebrief.finalArticulation,
    debrief: normalizedDebrief,
    seedResponse: normalizedDebrief.seedResponse,
    finalArticulation: normalizedDebrief.finalArticulation,
    growthDimensions: normalizedDebrief.growthDimensions,
  });

  if (normalizedDebrief.readiness === "ready_for_next_unit") {
    await deps.completeNode(nodeId);
  }

  return ok(normalizedDebrief);
};
