import { err, ok, type Result } from "../../../lib/result";
import { generateUnitScaffold } from "../orchestration/unit-flow";
import type { UnitContent } from "../types/becoming.types";

interface GetUnitDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getNodeById: (nodeId: string) => Promise<{
    id: string;
    parentNodeId: string | null;
    kind: string;
    title: string;
    summary: string;
    whyItMatters: string;
    orderIndex: number;
    status: string;
  } | null>;
  getPlanNodesBySession: (sessionId: string) => Promise<
    Array<{
      id: string;
      parentNodeId: string | null;
      kind: string;
      title: string;
      summary: string;
      whyItMatters: string;
      orderIndex: number;
      status: string;
    }> | null
  >;
  getTargetIdentity: (sessionId: string) => Promise<string | null>;
  listAttemptHistory: (sessionId: string) => Promise<
    Array<{
      title: string;
      score: number;
      readiness: string;
      finalArticulation: string | null;
      growthDimensions: string[] | null;
      improvements: string[];
      failureTags: string[];
      nextStep: string;
    }>
  >;
  createUnitContent: (input: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
  }) => Promise<UnitContent | null>;
}

export const getUnitWorkflow = async ({
  nodeId,
  sessionId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  deps: GetUnitDependencies;
}): Promise<Result<UnitContent>> => {
  const existingUnit = await deps.getUnitByNodeId(nodeId);
  if (existingUnit) {
    return ok(existingUnit);
  }

  const [node, planNodes, targetIdentity, priorLearning] = await Promise.all([
    deps.getNodeById(nodeId),
    deps.getPlanNodesBySession(sessionId),
    deps.getTargetIdentity(sessionId),
    deps.listAttemptHistory(sessionId),
  ]);

  if (!node) {
    return err("Unit node does not exist.");
  }

  if (node.kind !== "unit" && node.kind !== "integration") {
    return err("This node is not a Forge unit.");
  }

  if (node.status !== "ready" && existingUnit == null) {
    return err("This unit is not ready yet.");
  }

  if (!planNodes) {
    return err("Curriculum plan does not exist yet.");
  }

  if (!targetIdentity) {
    return err("Target identity is missing.");
  }

  const parentNode = node.parentNodeId
    ? planNodes.find((item) => item.id === node.parentNodeId) ?? null
    : null;

  const siblingUnits = planNodes
    .filter(
      (item) =>
        item.parentNodeId === node.parentNodeId && item.kind === node.kind,
    )
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const slotIndex =
    Math.max(
      siblingUnits.findIndex((item) => item.id === node.id),
      0,
    ) + 1;

  let setup;
    try {
      const completedClusterTitles = planNodes
      .filter((item) => item.kind === "skill_cluster")
      .filter((clusterNode) => {
        const childUnits = planNodes.filter(
          (item) =>
            item.parentNodeId === clusterNode.id &&
            item.kind === "unit",
        );

        return (
          childUnits.length > 0 &&
          childUnits.every((item) => item.status === "completed")
        );
      })
      .map((item) => item.title);

    setup = await generateUnitScaffold({
      slotKind: node.kind,
      slotIndex,
      totalSlots: siblingUnits.length || 1,
      clusterContext: parentNode
        ? {
            title: parentNode.title,
            summary: parentNode.summary,
            whyItMatters: parentNode.whyItMatters,
          }
        : null,
      integrationContext:
        node.kind === "integration"
          ? {
              completedClusterTitles,
            }
          : null,
      targetIdentity,
      priorLearning,
      nodeId: node.id,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate unit setup.",
    );
  }

  const createdUnit = await deps.createUnitContent({
    nodeId,
    title: setup.title,
    seedPrompt: setup.seedPrompt,
    seedHint: setup.seedHint,
    teachbackSetup: setup.teachbackSetup,
    scenario: setup.scenario,
  });

  return createdUnit
    ? ok(createdUnit)
    : err("Unit content could not be created.");
};
