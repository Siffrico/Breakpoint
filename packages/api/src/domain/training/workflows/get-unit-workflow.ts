import type { Result } from "../../../lib/result";
import type {
  EducationUnitState,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import { err, ok } from "../../../lib/result";
import { getUnitReadinessIssue } from "../education-unit/unit-readiness";
import { getEducationUnitState } from "../policies/education-unit-state-policy";

export interface GetUnitDependencies {
  getPlanNodesBySession: (sessionId: string) => Promise<
    | {
        id: string;
        kind: string;
        status: string;
      }[]
    | null
  >;
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
}

/**
 * Takes an owned session and node id, produces its current education-unit
 * state, and fails only when the plan/node/unit is unavailable.
 */
export const getUnitWorkflow = async ({
  nodeId,
  sessionId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  deps: GetUnitDependencies;
}): Promise<Result<EducationUnitState>> => {
  const planNodes = await deps.getPlanNodesBySession(sessionId);
  if (!planNodes) {
    return err("Curriculum plan does not exist yet.");
  }

  const node = planNodes.find((item) => item.id === nodeId);
  if (!node) {
    return err("Unit node does not exist in this learning project.");
  }
  if (node.kind !== "unit") {
    return err("This node is not an education unit.");
  }

  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit || getUnitReadinessIssue(unit) !== null) {
    return err(
      node.status === "ready"
        ? "UNIT_PREPARING"
        : "This unit is not ready yet.",
    );
  }

  const responses = await deps.getPhaseResponses(unit.id, sessionId);
  return ok(getEducationUnitState({ unit, responses }));
};
