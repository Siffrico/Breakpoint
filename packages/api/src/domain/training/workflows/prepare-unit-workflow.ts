import type { Result } from "../../../lib/result";
import type {
  EducationUnitState,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { UnitPreparationDependencies } from "../unit-preparation/prepare-unit-content";
import { err, ok } from "../../../lib/result";
import { generateClusterBriefing } from "../generate-cluster-briefing";
import {
  getEducationUnitState,
  shouldRefreshLegacyEducationUnit,
} from "../policies/education-unit-state-policy";
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
  saveNodeBriefing: (input: {
    nodeId: string;
    briefing: NonNullable<UnitContent["clusterBriefing"]>;
  }) => Promise<UnitContent["clusterBriefing"]>;
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
  if (node.kind !== "unit" && node.kind !== "integration") {
    return err("This node is not an education unit.");
  }

  const existingUnit = await deps.getUnitByNodeId(nodeId);
  if (node.status !== "ready" && !existingUnit) {
    return err("This unit is not ready yet.");
  }

  const existingResponses = existingUnit
    ? await deps.getPhaseResponses(existingUnit.id, sessionId)
    : [];
  const forceRefresh = existingUnit
    ? shouldRefreshLegacyEducationUnit({
        unit: existingUnit,
        responses: existingResponses,
      })
    : false;

  if (existingUnit && !forceRefresh) {
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
  const completedClusterTitles = planNodes
    .filter((item) => item.kind === "skill_cluster")
    .filter((cluster) => {
      const children = planNodes.filter(
        (item) => item.parentNodeId === cluster.id && item.kind === "unit",
      );
      return (
        children.length > 0 &&
        children.every((item) => item.status === "completed")
      );
    })
    .map((item) => item.title);
  const briefingPromise = parentNode
    ? generateClusterBriefing({
        slotKind: node.kind,
        totalSlots: siblingUnits.length || 1,
        clusterContext: {
          title: parentNode.title,
          summary: parentNode.summary,
          whyItMatters: parentNode.whyItMatters,
        },
        completedClusterTitles:
          node.kind === "integration" ? completedClusterTitles : undefined,
      }).catch(() => null)
    : Promise.resolve(null);

  try {
    const [preparedUnit, generatedBriefing] = await Promise.all([
      runPrepareUnit({ node, sessionId, deps, forceRefresh }),
      briefingPromise,
    ]);

    if (parentNode && generatedBriefing) {
      await deps
        .saveNodeBriefing({
          nodeId: parentNode.id,
          briefing: generatedBriefing,
        })
        .catch(() => null);
    }

    const canonicalUnit = (await deps.getUnitByNodeId(nodeId)) ?? preparedUnit;
    const responses = await deps.getPhaseResponses(canonicalUnit.id, sessionId);
    return ok(getEducationUnitState({ unit: canonicalUnit, responses }));
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Failed to generate unit setup.",
    );
  }
};
