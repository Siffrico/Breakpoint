import { err, ok, type Result } from "../../../lib/result";
import { gradeUnitResponse } from "../policies/grade-unit-response";
import type { Debrief, UnitContent } from "../types/becoming.types";

interface SubmitUnitResponseDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getTargetIdentity: (sessionId: string) => Promise<string | null>;
  saveAttempt: (input: {
    sessionId: string;
    userId?: string | null;
    unitId: string;
    response: string;
    debrief: Debrief;
  }) => Promise<unknown>;
  completeNode: (nodeId: string) => Promise<void>;
}

export const submitUnitResponseWorkflow = async ({
  sessionId,
  nodeId,
  response,
  userId,
  deps,
}: {
  sessionId: string;
  nodeId: string;
  response: string;
  userId?: string | null;
  deps: SubmitUnitResponseDependencies;
}): Promise<Result<Debrief>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  const trimmedResponse = response.trim();
  if (trimmedResponse.length < 120) {
    return err("Write a fuller scenario response before submitting.");
  }

  const targetIdentity = await deps.getTargetIdentity(sessionId);
  if (!targetIdentity) {
    return err("Target identity is missing.");
  }

  let debrief;
  try {
    debrief = await gradeUnitResponse({
      response: trimmedResponse,
      unit: {
        title: unit.title,
        concept: unit.concept,
        workedExample: unit.workedExample,
        scenario: unit.scenario,
      },
      targetIdentity,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate the unit debrief.",
    );
  }

  await deps.saveAttempt({
    sessionId,
    userId,
    unitId: unit.id,
    response: trimmedResponse,
    debrief,
  });

  if (debrief.readiness === "ready_for_next_unit") {
    await deps.completeNode(nodeId);
  }

  return ok(debrief);
};
