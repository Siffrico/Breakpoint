import { err, ok, type Result } from "../../../lib/result";
import { triggerRecallGateWorkflow } from "./trigger-recall-gate-workflow";
import { getReadyNextAction } from "./resolve-recall-gate-workflow";
import { shouldTriggerRecallGate } from "../policies/recall-policy";
import {
  buildEducationDebrief,
  getEducationUnitState,
} from "../policies/education-unit-state-policy";
import type {
  Debrief,
  FinalizeForgeUnitResult,
  PhaseResponseRecord,
  RecallGate,
  UnitContent,
} from "../types/becoming.types";

interface FinalizeForgeUnitDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
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
  getNodeById: (nodeId: string) => Promise<{
    id: string;
    planId: string;
    parentNodeId: string | null;
    kind: string;
    status: string;
    orderIndex: number;
  } | null>;
  markNodeCompleted: (nodeId: string) => Promise<void>;
  advancePlanAfterCompletion: (
    nodeId: string,
  ) => Promise<{ id: string; kind: string } | null>;
  getPlanNodesBySession: (sessionId: string) => Promise<
    Array<{
      id: string;
      parentNodeId: string | null;
      planId: string;
      kind: string;
      status: string;
      orderIndex: number;
      title: string;
      summary: string;
    }> | null
  >;
  generateCapstone?: (input: {
    nodeId: string;
    sessionId: string;
    userId?: string | null;
  }) => Promise<void>;
  getGateByTriggerUnit: (
    planId: string,
    triggerAfterUnitNodeId: string,
  ) => Promise<RecallGate | null>;
  triggerRecallGate: (input: {
    triggerAfterUnitNodeId: string;
    sessionId: string;
    userId?: string | null;
  }) => Promise<Result<RecallGate>>;
}

const deriveNextAction = (
  node: { id: string; kind: string } | null,
): FinalizeForgeUnitResult => {
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

export const finalizeForgeUnitWorkflow = async ({
  nodeId,
  sessionId,
  userId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  userId?: string | null;
  deps: FinalizeForgeUnitDependencies;
}): Promise<Result<FinalizeForgeUnitResult>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  const node = await deps.getNodeById(nodeId);
  if (!node) {
    return err("Unit node does not exist.");
  }

  const phaseResponses = await deps.getPhaseResponses(unit.id, sessionId);
  const state = getEducationUnitState({
    unit,
    responses: phaseResponses,
  });
  const debrief: Debrief = buildEducationDebrief({
    state,
  });
  const existingAttempt = await deps.getLatestAttemptByUnit(sessionId, unit.id);
  if (!existingAttempt) {
    await deps.saveAttempt({
      sessionId,
      userId,
      unitId: unit.id,
      response: state.resultFeedback ?? debrief.finalArticulation,
      debrief,
      seedResponse: debrief.seedResponse,
      finalArticulation: debrief.finalArticulation,
      growthDimensions: debrief.growthDimensions,
    });
  }

  if (state.result !== "pass") {
    return ok({ nextAction: "home" });
  }

  if (node.status !== "completed") {
    await deps.markNodeCompleted(nodeId);
  }

  const existingGate = await deps.getGateByTriggerUnit(node.planId, nodeId);
  if (existingGate?.status === "pending" || existingGate?.status === "active") {
    return ok({
      nextAction: "recall_gate",
      gate: existingGate,
    });
  }

  const planNodes = await deps.getPlanNodesBySession(sessionId);
  if (!planNodes) {
    return err("Curriculum plan does not exist yet.");
  }

  if (existingGate) {
    return ok(
      getReadyNextAction({
        planNodes,
      }),
    );
  }

  const completedUnitCount = planNodes.filter(
    (planNode) =>
      (planNode.kind === "unit" || planNode.kind === "integration") &&
      planNode.status === "completed",
  ).length;

  if (shouldTriggerRecallGate(completedUnitCount)) {
    const gateResult = await deps.triggerRecallGate({
      triggerAfterUnitNodeId: nodeId,
      sessionId,
      userId,
    });

    if (!gateResult.success) {
      return err(gateResult.error ?? "Recall gate could not be created.");
    }

    return ok({
      nextAction: "recall_gate",
      gate: gateResult.data,
    });
  }

  const nextNode = await deps.advancePlanAfterCompletion(nodeId);
  if (nextNode?.kind === "simulation" && deps.generateCapstone) {
    try {
      await deps.generateCapstone({
        nodeId: nextNode.id,
        sessionId,
        userId,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
      }
    }
  }

  const refreshedPlanNodes = await deps.getPlanNodesBySession(sessionId);
  return ok(
    nextNode
      ? deriveNextAction(nextNode)
      : refreshedPlanNodes
        ? getReadyNextAction({
            planNodes: refreshedPlanNodes,
          })
        : { nextAction: "home" },
  );
};
