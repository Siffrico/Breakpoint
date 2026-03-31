import { err, ok, type Result } from "../../../lib/result";
import { generateRecallProbe } from "../generate-recall-probes";
import {
  buildRecallProbePlan,
  selectRecallCandidates,
} from "../policies/recall-policy";
import type {
  RecallGate,
  UnitContent,
  UnitRecallState,
} from "../types/becoming.types";

interface TriggerRecallGateDependencies {
  getNodeById: (nodeId: string) => Promise<{
    id: string;
    planId: string;
    parentNodeId: string | null;
    kind: string;
    status: string;
    title: string;
    summary: string;
    orderIndex: number;
  } | null>;
  getPlanNodesBySession: (sessionId: string) => Promise<
    Array<{
      id: string;
      parentNodeId: string | null;
      kind: string;
      status: string;
      title: string;
      summary: string;
      orderIndex: number;
    }> | null
  >;
  listUnitContentsByNodeIds: (nodeIds: string[]) => Promise<UnitContent[]>;
  listLatestAttemptsByUnitIds: (
    sessionId: string,
    unitIds: string[],
  ) => Promise<
    Array<{
      unitContentId: string;
      score: number;
      seedResponse: string | null;
      finalArticulation: string | null;
    }>
  >;
  listRecallStates: (
    planId: string,
    unitNodeIds: string[],
  ) => Promise<UnitRecallState[]>;
  getGateByTriggerUnit: (
    planId: string,
    triggerAfterUnitNodeId: string,
  ) => Promise<RecallGate | null>;
  createGate: (input: {
    planId: string;
    sessionId: string;
    userId?: string | null;
    triggerAfterUnitNodeId: string;
  }) => Promise<{ id: string } | null>;
  createProbes: (input: {
    gateId: string;
    probes: Array<{
      probeOrder: number;
      probeType: "seed_return" | "interleave" | "compression";
      sourceUnitNodeIds: string[];
      prompt: string;
      seedSnapshot?: string | null;
    }>;
  }) => Promise<unknown>;
  getGateById: (gateId: string) => Promise<RecallGate | null>;
}

export const triggerRecallGateWorkflow = async ({
  triggerAfterUnitNodeId,
  sessionId,
  userId,
  deps,
}: {
  triggerAfterUnitNodeId: string;
  sessionId: string;
  userId?: string | null;
  deps: TriggerRecallGateDependencies;
}): Promise<Result<RecallGate>> => {
  const [triggerNode, planNodes] = await Promise.all([
    deps.getNodeById(triggerAfterUnitNodeId),
    deps.getPlanNodesBySession(sessionId),
  ]);

  if (!triggerNode || !planNodes) {
    return err("Recall gate context is missing.");
  }

  const existingGate = await deps.getGateByTriggerUnit(
    triggerNode.planId,
    triggerAfterUnitNodeId,
  );
  if (existingGate) {
    return ok(existingGate);
  }

  const completedNodes = planNodes
    .filter(
      (node) =>
        (node.kind === "unit" || node.kind === "integration") &&
        node.status === "completed" &&
        node.id !== triggerAfterUnitNodeId,
    )
    .sort((left, right) => left.orderIndex - right.orderIndex);

  if (completedNodes.length === 0) {
    return err("Not enough completed units to trigger a recall gate.");
  }

  const unitContents = await deps.listUnitContentsByNodeIds(
    completedNodes.map((node) => node.id),
  );
  const attempts = await deps.listLatestAttemptsByUnitIds(
    sessionId,
    unitContents.map((unit) => unit.id),
  );
  const recallStates = await deps.listRecallStates(
    triggerNode.planId,
    completedNodes.map((node) => node.id),
  );

  const unitByNodeId = new Map(unitContents.map((unit) => [unit.nodeId, unit]));
  const attemptByUnitId = new Map(
    attempts.map((attempt) => [attempt.unitContentId, attempt]),
  );
  const recallStateByUnitNodeId = new Map(
    recallStates.map((state) => [state.unitNodeId, state]),
  );

  const candidates = completedNodes
    .map((node) => {
      const unit = unitByNodeId.get(node.id);
      const attempt = unit ? attemptByUnitId.get(unit.id) : null;
      if (!unit || !attempt) {
        return null;
      }

      const recallState = recallStateByUnitNodeId.get(node.id);
      const clusterNode = node.parentNodeId
        ? planNodes.find((planNode) => planNode.id === node.parentNodeId) ?? null
        : null;

      return {
        unitNodeId: node.id,
        unitTitle: unit.title,
        unitSummary: node.summary,
        clusterNodeId: clusterNode?.id ?? null,
        clusterTitle: clusterNode?.title ?? null,
        orderIndex: node.orderIndex,
        originalScore: attempt.score,
        seedResponse: attempt.seedResponse,
        finalArticulation: attempt.finalArticulation,
        recallCount: recallState?.recallCount ?? 0,
        decayCount: recallState?.decayCount ?? 0,
        lastRecallOrderIndex: recallState?.lastRecallOrderIndex ?? null,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null);

  if (candidates.length === 0) {
    return err("Completed units are missing recall context.");
  }

  const selectedCandidates = selectRecallCandidates({
    candidates,
    triggerOrderIndex: triggerNode.orderIndex,
  });

  const probePlan = buildRecallProbePlan(selectedCandidates);
  if (probePlan.length === 0) {
    return err("Recall gate probes could not be planned.");
  }

  const createdGate = await deps.createGate({
    planId: triggerNode.planId,
    sessionId,
    userId,
    triggerAfterUnitNodeId,
  });

  if (!createdGate) {
    return err("Recall gate could not be created.");
  }

  const probeRows = [];
  for (const [index, plan] of probePlan.entries()) {
    const sourceUnits = plan.sourceUnitNodeIds
      .map((unitNodeId) => {
        const candidate = selectedCandidates.find(
          (selectedCandidate) => selectedCandidate.unitNodeId === unitNodeId,
        );
        const unit = unitByNodeId.get(unitNodeId);

        if (!candidate || !unit) {
          return null;
        }

        return {
          nodeId: unitNodeId,
          title: candidate.unitTitle,
          summary: candidate.unitSummary,
          clusterTitle: candidate.clusterTitle,
          seedResponse: candidate.seedResponse,
          finalArticulation: candidate.finalArticulation,
        };
      })
      .filter((unit): unit is NonNullable<typeof unit> => unit != null);

    const generatedProbe = await generateRecallProbe({
      probeType: plan.probeType,
      sourceUnits,
    });

    probeRows.push({
      probeOrder: index,
      probeType: plan.probeType,
      sourceUnitNodeIds: plan.sourceUnitNodeIds,
      prompt: generatedProbe.prompt,
      seedSnapshot: generatedProbe.seedSnapshot,
    });
  }

  await deps.createProbes({
    gateId: createdGate.id,
    probes: probeRows,
  });

  const gate = await deps.getGateById(createdGate.id);
  return gate ? ok(gate) : err("Recall gate could not be loaded.");
};
