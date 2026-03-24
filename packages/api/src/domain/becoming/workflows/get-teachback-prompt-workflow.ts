import { err, ok, type Result } from "../../../lib/result";
import {
  allPracticeRoundsPassed,
  getTeachbackResponses,
} from "./forge-workflow-helpers";
import type {
  PhaseResponseRecord,
  UnitContent,
} from "../types/becoming.types";

interface GetTeachbackPromptDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
}

export const getTeachbackPromptWorkflow = async ({
  nodeId,
  sessionId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  deps: GetTeachbackPromptDependencies;
}): Promise<Result<{ studentMessage: string; round: number }>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  const phaseResponses = await deps.getPhaseResponses(unit.id, sessionId);
  if (!allPracticeRoundsPassed(phaseResponses)) {
    return err("Pass all practice rounds before starting the teach-back.");
  }

  const teachbackResponses = getTeachbackResponses(phaseResponses);
  const latestTeachback = teachbackResponses.at(-1);
  if (latestTeachback && latestTeachback.sequence < 3 && latestTeachback.aiResponse) {
    return ok({
      studentMessage: latestTeachback.aiResponse,
      round: latestTeachback.sequence + 1,
    });
  }

  return ok({
    studentMessage: unit.teachbackSetup.openingMisconception,
    round: 1,
  });
};
