import { err, ok, type Result } from "../../../lib/result";
import { generateRecallRepair } from "../generate-recall-repair";
import { gradeRecallProbe } from "../grade-recall-probe";
import { resolveRecallGateWorkflow, type RecallGateResolutionResult } from "./resolve-recall-gate-workflow";
import type { RecallGate, UnitContent, UnitRecallState } from "../types/becoming.types";

interface SubmitRecallProbeDependencies {
  getGateById: (gateId: string) => Promise<RecallGate | null>;
  updateProbe: (input: {
    probeId: string;
    userResponse?: string | null;
    score?: number | null;
    passed?: boolean | null;
    repairPrompt?: string | null;
    repairResponse?: string | null;
    repairScore?: number | null;
    repairPassed?: boolean | null;
    status?: "pending" | "answered" | "repair_pending" | "repaired" | "failed";
    completedAt?: Date | null;
  }) => Promise<unknown>;
  getPlanNodesBySession: (sessionId: string) => Promise<
    Array<{
      id: string;
      parentNodeId: string | null;
      kind: string;
      title: string;
      summary: string;
      orderIndex: number;
      status: string;
      planId: string;
    }> | null
  >;
  listUnitContentsByNodeIds: (nodeIds: string[]) => Promise<UnitContent[]>;
  updateGate: Parameters<typeof resolveRecallGateWorkflow>[0]["deps"]["updateGate"];
  listRecallStates: (
    planId: string,
    unitNodeIds: string[],
  ) => Promise<UnitRecallState[]>;
  upsertRecallState: Parameters<typeof resolveRecallGateWorkflow>[0]["deps"]["upsertRecallState"];
  advancePlanAfterCompletion: (
    nodeId: string,
  ) => Promise<{ id: string; kind: string } | null>;
  generateCapstone?: (input: {
    nodeId: string;
    sessionId: string;
  }) => Promise<void>;
}

const buildSourceContext = async ({
  gate,
  sourceUnitNodeIds,
  deps,
}: {
  gate: RecallGate;
  sourceUnitNodeIds: string[];
  deps: Pick<
    SubmitRecallProbeDependencies,
    "getPlanNodesBySession" | "listUnitContentsByNodeIds"
  >;
}) => {
  const [planNodes, unitContents] = await Promise.all([
    deps.getPlanNodesBySession(gate.sessionId),
    deps.listUnitContentsByNodeIds(sourceUnitNodeIds),
  ]);

  const nodesById = new Map((planNodes ?? []).map((node) => [node.id, node]));
  const unitByNodeId = new Map(unitContents.map((unit) => [unit.nodeId, unit]));

  return sourceUnitNodeIds
    .map((unitNodeId) => {
      const node = nodesById.get(unitNodeId);
      const unit = unitByNodeId.get(unitNodeId);
      if (!node) {
        return null;
      }

      const clusterNode = node.parentNodeId
        ? nodesById.get(node.parentNodeId) ?? null
        : null;

      return [
        `Unit: ${unit?.title ?? node.title}`,
        clusterNode ? `Cluster: ${clusterNode.title}` : null,
        `Summary: ${node.summary}`,
        unit?.seedPrompt ? `Seed prompt: ${unit.seedPrompt}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter((entry): entry is string => entry != null)
    .join("\n\n");
};

export const submitRecallProbeWorkflow = async ({
  gateId,
  probeId,
  mode,
  response,
  deps,
}: {
  gateId: string;
  probeId: string;
  mode: "probe" | "repair";
  response: string;
  deps: SubmitRecallProbeDependencies;
}): Promise<Result<RecallGateResolutionResult>> => {
  const gate = await deps.getGateById(gateId);
  if (!gate) {
    return err("Recall gate does not exist.");
  }

  const probe = gate.probes.find((item) => item.id === probeId);
  if (!probe) {
    return err("Recall probe does not exist.");
  }

  const trimmedResponse = response.trim();
  if (trimmedResponse.length < 20) {
    return err("Write a fuller recall response before submitting.");
  }

  const sourceContext = await buildSourceContext({
    gate,
    sourceUnitNodeIds: probe.sourceUnitNodeIds,
    deps,
  });

  if (mode === "probe") {
    if (probe.status !== "pending") {
      return err("This recall probe has already been submitted.");
    }

    const grade = await gradeRecallProbe({
      probeType: probe.probeType,
      prompt: probe.prompt,
      response: trimmedResponse,
      sourceContext,
    });

    if (grade.passed) {
      await deps.updateProbe({
        probeId,
        userResponse: trimmedResponse,
        score: grade.score,
        passed: true,
        status: "answered",
        completedAt: new Date(),
      });
    } else {
      const repair = await generateRecallRepair({
        prompt: probe.prompt,
        response: trimmedResponse,
        feedback: grade.feedback,
        decayTarget: grade.decayTarget,
        sourceContext,
      });

      await deps.updateProbe({
        probeId,
        userResponse: trimmedResponse,
        score: grade.score,
        passed: false,
        repairPrompt: repair.prompt,
        status: "repair_pending",
      });
    }
  } else {
    if (probe.status !== "repair_pending" || !probe.repairPrompt) {
      return err("This recall repair is not available.");
    }

    const grade = await gradeRecallProbe({
      probeType: probe.probeType,
      prompt: probe.prompt,
      response: trimmedResponse,
      sourceContext,
      repairPrompt: probe.repairPrompt,
    });

    await deps.updateProbe({
      probeId,
      repairResponse: trimmedResponse,
      repairScore: grade.score,
      repairPassed: grade.passed,
      status: grade.passed ? "repaired" : "failed",
      completedAt: new Date(),
    });
  }

  const updatedGate = await deps.getGateById(gateId);
  if (!updatedGate) {
    return err("Recall gate could not be refreshed.");
  }

  if (
    updatedGate.probes.some(
      (updatedProbe) =>
        updatedProbe.status === "pending" ||
        updatedProbe.status === "repair_pending",
    )
  ) {
    return ok({
      gate: updatedGate,
      nextAction: null,
    });
  }

  return resolveRecallGateWorkflow({
    gateId,
    deps: {
      getGateById: deps.getGateById,
      updateGate: deps.updateGate,
      listRecallStates: deps.listRecallStates,
      upsertRecallState: deps.upsertRecallState,
      getPlanNodesBySession: deps.getPlanNodesBySession,
      advancePlanAfterCompletion: deps.advancePlanAfterCompletion,
      generateCapstone: deps.generateCapstone,
    },
  });
};
