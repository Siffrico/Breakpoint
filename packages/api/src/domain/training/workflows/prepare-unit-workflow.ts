import type { Result } from "../../../lib/result";
import type {
  EducationUnitState,
  PhaseResponseRecord,
} from "../types/training.types";
import type { UnitPreparationDependencies } from "../unit-preparation/prepare-unit-content";
import { err, ok } from "../../../lib/result";
import { generateClusterBriefing } from "../generate-cluster-briefing";
import { getEducationUnitState } from "../policies/education-unit-state-policy";
import { runPrepareUnit } from "../unit-preparation/prepare-unit-edge";

interface PreparationPlanNode {
  id: string;
  parentNodeId: string | null;
  kind: string;
  title: string;
  summary: string;
  whyItMatters: string;
  orderIndex: number;
  status: string;
}

interface PrepareUnitDependencies extends UnitPreparationDependencies {
  getPlanNodesBySession: (
    sessionId: string,
  ) => Promise<PreparationPlanNode[] | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
}

/**
 * Takes an owned ready unit, produces its canonical prepared state, and fails
 * only when ownership/readiness/context, generation, or persistence fails.
 */
export const prepareUnitWorkflow = async ({
  nodeId,
  sessionId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  deps: PrepareUnitDependencies;
}): Promise<Result<EducationUnitState>> => {
  const planNodes = await deps.getPlanNodesBySession(sessionId);
  if (!planNodes) return err("Curriculum plan does not exist yet.");

  const node = planNodes.find((item) => item.id === nodeId);
  if (!node) return err("Unit node does not exist in this learning project.");
  if (node.kind !== "unit") {
    return err("This node is not an education unit.");
  }

  const existingUnit = await deps.getUnitByNodeId(nodeId);
  if (node.status !== "ready" && !existingUnit) {
    return err("This unit is not ready yet.");
  }

  const existingResponses = existingUnit
    ? await deps.getPhaseResponses(existingUnit.id, sessionId)
    : [];
  if (existingUnit?.unitMasteryContract) {
    return ok(
      getEducationUnitState({
        unit: existingUnit,
        responses: existingResponses,
      }),
    );
  }

  const parentNode = node.parentNodeId
    ? (planNodes.find((item) => item.id === node.parentNodeId) ?? null)
    : null;
  const siblingUnits = planNodes.filter(
    (item) =>
      item.parentNodeId === node.parentNodeId && item.kind === node.kind,
  );
  try {
    const preparedUnit = await runPrepareUnit({
      node,
      sessionId,
      deps,
      prepareClusterBriefing: parentNode
        ? async () => ({
            nodeId: parentNode.id,
            briefing: await generateClusterBriefing({
              slotKind: "unit",
              totalSlots: siblingUnits.length || 1,
              clusterContext: {
                title: parentNode.title,
                summary: parentNode.summary,
                whyItMatters: parentNode.whyItMatters,
              },
            }),
          })
        : undefined,
    });

    const canonicalUnit = (await deps.getUnitByNodeId(nodeId)) ?? preparedUnit;
    const responses = await deps.getPhaseResponses(canonicalUnit.id, sessionId);
    return ok(getEducationUnitState({ unit: canonicalUnit, responses }));
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Failed to generate unit setup.",
    );
  }
};
