import { err, ok, type Result } from "../../../lib/result";
import type {
  FinalizeForgeUnitResult,
  RecallGate,
  RecallGateStatus,
  UnitRecallState,
} from "../types/becoming.types";

export interface RecallGateResolutionResult {
  gate: RecallGate;
  nextAction: FinalizeForgeUnitResult | null;
}

interface ResolveRecallGateDependencies {
  getGateById: (gateId: string) => Promise<RecallGate | null>;
  updateGate: (input: {
    gateId: string;
    status?: RecallGateStatus;
    completedAt?: Date | null;
  }) => Promise<unknown>;
  listRecallStates: (
    planId: string,
    unitNodeIds: string[],
  ) => Promise<UnitRecallState[]>;
  upsertRecallState: (input: {
    unitNodeId: string;
    planId: string;
    lastRecalledAt: Date | null;
    lastRecallOrderIndex: number | null;
    recallCount: number;
    decayCount: number;
    lastRecallScore: number | null;
    status: "retained" | "decayed" | "repaired";
  }) => Promise<unknown>;
  getPlanNodesBySession: (sessionId: string) => Promise<
    Array<{
      id: string;
      planId: string;
      parentNodeId: string | null;
      kind: string;
      status: string;
      orderIndex: number;
    }> | null
  >;
  advancePlanAfterCompletion: (nodeId: string) => Promise<{
    id: string;
    kind: string;
  } | null>;
  generateCapstone?: (input: {
    nodeId: string;
    sessionId: string;
  }) => Promise<void>;
}

const deriveNextAction = (node: { id: string; kind: string } | null): FinalizeForgeUnitResult => {
  if (!node) {
    return { nextAction: "home" };
  }

  if (node.kind === "simulation") {
    return {
      nextAction: "simulation",
      nodeId: node.id,
    };
  }

  return {
    nextAction: "unit",
    nodeId: node.id,
  };
};

export const getReadyNextAction = ({
  planNodes,
}: {
  planNodes: Array<{
    id: string;
    kind: string;
    status: string;
    orderIndex: number;
  }>;
}): FinalizeForgeUnitResult => {
  const readyNode =
    [...planNodes]
      .filter(
        (node) =>
          (node.kind === "unit" ||
            node.kind === "integration" ||
            node.kind === "simulation") &&
          node.status === "ready",
      )
      .sort((left, right) => left.orderIndex - right.orderIndex)[0] ?? null;

  return deriveNextAction(readyNode);
};

export const resolveRecallGateWorkflow = async ({
  gateId,
  deps,
}: {
  gateId: string;
  deps: ResolveRecallGateDependencies;
}): Promise<Result<RecallGateResolutionResult>> => {
  const gate = await deps.getGateById(gateId);
  if (!gate) {
    return err("Recall gate does not exist.");
  }

  const unresolvedProbe = gate.probes.find(
    (probe) => probe.status === "pending" || probe.status === "repair_pending",
  );
  if (unresolvedProbe) {
    return ok({
      gate,
      nextAction: null,
    });
  }

  const planNodes = await deps.getPlanNodesBySession(gate.sessionId);
  if (!planNodes) {
    return err("Curriculum plan does not exist yet.");
  }

  const triggerNode = planNodes.find(
    (node) => node.id === gate.triggerAfterUnitNodeId,
  );
  if (!triggerNode) {
    return err("Trigger node does not exist.");
  }

  const sourceUnitNodeIds = Array.from(
    new Set(gate.probes.flatMap((probe) => probe.sourceUnitNodeIds)),
  );
  const existingStates = await deps.listRecallStates(gate.planId, sourceUnitNodeIds);
  const existingStateByUnitNodeId = new Map(
    existingStates.map((state) => [state.unitNodeId, state]),
  );
  const now = new Date();

  for (const unitNodeId of sourceUnitNodeIds) {
    const relatedProbes = gate.probes.filter((probe) =>
      probe.sourceUnitNodeIds.includes(unitNodeId),
    );
    const previousState = existingStateByUnitNodeId.get(unitNodeId);
    const unitFailed = relatedProbes.some((probe) => probe.status === "failed");
    const unitRepaired =
      !unitFailed && relatedProbes.some((probe) => probe.status === "repaired");
    const scoreValues = relatedProbes.flatMap((probe) =>
      [probe.repairScore, probe.score].filter(
        (score): score is number => score != null,
      ),
    );

    await deps.upsertRecallState({
      unitNodeId,
      planId: gate.planId,
      lastRecalledAt: now,
      lastRecallOrderIndex: triggerNode.orderIndex,
      recallCount: (previousState?.recallCount ?? 0) + 1,
      decayCount: (previousState?.decayCount ?? 0) + (unitFailed ? 1 : 0),
      lastRecallScore:
        scoreValues.length > 0
          ? Math.max(...scoreValues)
          : (previousState?.lastRecallScore ?? null),
      status: unitFailed ? "decayed" : unitRepaired ? "repaired" : "retained",
    });
  }

  const gateStatus: RecallGateStatus = gate.probes.some(
    (probe) => probe.status === "failed",
  )
    ? "flagged"
    : gate.probes.some((probe) => probe.status === "repaired")
      ? "repaired"
      : "passed";

  await deps.updateGate({
    gateId,
    status: gateStatus,
    completedAt: now,
  });

  const nextNode = await deps.advancePlanAfterCompletion(gate.triggerAfterUnitNodeId);
  if (nextNode?.kind === "simulation" && deps.generateCapstone) {
    try {
      await deps.generateCapstone({
        nodeId: nextNode.id,
        sessionId: gate.sessionId,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
      }
    }
  }

  const refreshedGate = await deps.getGateById(gateId);
  if (!refreshedGate) {
    return err("Recall gate could not be refreshed.");
  }

  const refreshedPlanNodes = await deps.getPlanNodesBySession(gate.sessionId);

  return ok({
    gate: refreshedGate,
    nextAction: nextNode
      ? deriveNextAction(nextNode)
      : refreshedPlanNodes
        ? getReadyNextAction({
            planNodes: refreshedPlanNodes,
          })
        : { nextAction: "home" },
  });
};
