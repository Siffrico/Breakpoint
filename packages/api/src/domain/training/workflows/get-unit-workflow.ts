import type { Result } from "../../../lib/result";
import type {
  EducationUnitState,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import { err, ok } from "../../../lib/result";
import { generateClusterBriefing } from "../generate-cluster-briefing";
import {
  getEducationUnitState,
  shouldRefreshLegacyEducationUnit,
} from "../policies/education-unit-state-policy";
import { runPrepareUnit } from "../unit-preparation/prepare-unit-edge";

interface GetUnitDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getPlanNodesBySession: (sessionId: string) => Promise<
    | {
        id: string;
        parentNodeId: string | null;
        kind: string;
        title: string;
        summary: string;
        whyItMatters: string;
        orderIndex: number;
        status: string;
      }[]
    | null
  >;
  getTargetIdentity: (sessionId: string) => Promise<string | null>;
  listAttemptHistory: (sessionId: string) => Promise<
    {
      title: string;
      score: number;
      readiness: string;
      finalArticulation: string | null;
      growthDimensions: string[] | null;
      improvements: string[];
      failureTags: string[];
      nextStep: string;
    }[]
  >;
  createUnitContentIfAbsent: (input: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
  }) => Promise<UnitContent | null>;
  replaceUnitContent: (input: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
  }) => Promise<UnitContent | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  saveNodeBriefing: (input: {
    nodeId: string;
    briefing: NonNullable<UnitContent["clusterBriefing"]>;
  }) => Promise<UnitContent["clusterBriefing"]>;
}

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

  if (node.kind !== "unit" && node.kind !== "integration") {
    return err("This node is not an education unit.");
  }

  const existingUnit = await deps.getUnitByNodeId(nodeId);
  if (node.status !== "ready" && existingUnit == null) {
    return err("This unit is not ready yet.");
  }

  const parentNode = node.parentNodeId
    ? (planNodes.find((item) => item.id === node.parentNodeId) ?? null)
    : null;

  const siblingUnits = planNodes
    .filter(
      (item) =>
        item.parentNodeId === node.parentNodeId && item.kind === node.kind,
    )
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const completedClusterTitles = planNodes
    .filter((item) => item.kind === "skill_cluster")
    .filter((clusterNode) => {
      const childUnits = planNodes.filter(
        (item) => item.parentNodeId === clusterNode.id && item.kind === "unit",
      );

      return (
        childUnits.length > 0 &&
        childUnits.every((item) => item.status === "completed")
      );
    })
    .map((item) => item.title);

  const briefingPromise =
    parentNode && existingUnit?.clusterBriefing == null
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

  if (existingUnit) {
    const existingResponses = await deps.getPhaseResponses(
      existingUnit.id,
      sessionId,
    );
    const needsScenarioRefresh = shouldRefreshLegacyEducationUnit({
      unit: existingUnit,
      responses: existingResponses,
    });
    const generatedBriefing = await briefingPromise;

    if (parentNode && generatedBriefing) {
      try {
        await deps.saveNodeBriefing({
          nodeId: parentNode.id,
          briefing: generatedBriefing,
        });
      } catch {
        // Briefing generation is non-blocking for unit access.
      }
    }

    if (!needsScenarioRefresh) {
      const refreshedUnit = await deps.getUnitByNodeId(nodeId);
      const hydratedUnit = refreshedUnit ?? existingUnit;
      const phaseResponses = await deps.getPhaseResponses(
        hydratedUnit.id,
        sessionId,
      );
      return ok(
        getEducationUnitState({
          unit: hydratedUnit,
          responses: phaseResponses,
        }),
      );
    }
  }

  let createdUnit: UnitContent;
  let generatedBriefing: NonNullable<UnitContent["clusterBriefing"]> | null;
  try {
    [createdUnit, generatedBriefing] = await Promise.all([
      runPrepareUnit({
        node,
        sessionId,
        deps,
        forceRefresh: existingUnit != null,
      }),
      briefingPromise,
    ]);
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Failed to generate unit setup.",
    );
  }

  if (parentNode && generatedBriefing) {
    try {
      await deps.saveNodeBriefing({
        nodeId: parentNode.id,
        briefing: generatedBriefing,
      });
    } catch {
      // Briefing generation is non-blocking for unit access.
    }
  }

  const refreshedUnit = await deps.getUnitByNodeId(nodeId);
  const hydratedUnit = refreshedUnit ?? createdUnit;
  const phaseResponses = await deps.getPhaseResponses(
    hydratedUnit.id,
    sessionId,
  );

  return ok(
    getEducationUnitState({
      unit: hydratedUnit,
      responses: phaseResponses,
    }),
  );
};
