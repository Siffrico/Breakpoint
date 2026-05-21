import { err, ok, type Result } from "../../../lib/result";
import type { CapstoneState, CapstoneScenario } from "../types/training.types";
import { runCapstoneAgent } from "../capstone/run-capstone-agent";
import { getCapstoneMaxRounds } from "../capstone/fallback-capstone";

interface GenerateCapstoneDependencies {
  getNodeById: (nodeId: string) => Promise<{
    id: string;
    planId: string;
    parentNodeId: string | null;
    kind: string;
    title: string;
    summary: string;
    whyItMatters: string;
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
      status: string;
      orderIndex: number;
    }> | null
  >;
  getCapstoneByNodeId: (simulationNodeId: string, sessionId: string) => Promise<CapstoneState["capstone"] | null>;
  listCapstoneMessages: (capstoneId: string) => Promise<CapstoneState["messages"]>;
  saveCapstone: (input: {
    simulationNodeId: string;
    planId: string;
    sessionId: string;
    userId?: string | null;
    scenario: CapstoneScenario;
    maxRounds: number;
  }) => Promise<CapstoneState["capstone"] | null>;
  appendCapstoneMessage: (input: {
    capstoneId: string;
    role: CapstoneState["messages"][number]["role"];
    content: string;
    sequence: number;
    round: number;
  }) => Promise<CapstoneState["messages"][number] | null>;
  getUnitByNodeId: (nodeId: string) => Promise<{
    id: string;
    title: string;
    summary: string;
  } | null>;
  listLatestAttemptsByUnitIds: (
    sessionId: string,
    unitIds: string[],
  ) => Promise<
    Array<{
      unitContentId: string;
      score: number;
      readiness: string;
      growthDimensions: string[] | null;
      improvements: string[];
      failureTags: string[];
    }>
  >;
}

const getInitialAssistantMessage = (scenario: CapstoneScenario) => {
  switch (scenario.format) {
    case "debate":
      return scenario.openingArgument;
    case "teach":
      return scenario.openingQuestion;
    case "build":
      return null;
  }
};

export const generateCapstoneWorkflow = async ({
  nodeId,
  sessionId,
  userId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  userId?: string | null;
  deps: GenerateCapstoneDependencies;
}): Promise<Result<CapstoneState>> => {
  const simulationNode = await deps.getNodeById(nodeId);
  if (!simulationNode) {
    return err("Simulation node does not exist.");
  }

  if (simulationNode.kind !== "simulation") {
    return err("This node is not a cluster simulation.");
  }

  if (simulationNode.status !== "ready" && simulationNode.status !== "completed") {
    return err("This simulation is not ready yet.");
  }

  const existingCapstone = await deps.getCapstoneByNodeId(nodeId, sessionId);
  if (existingCapstone) {
    const messages = await deps.listCapstoneMessages(existingCapstone.id);
    return ok({
      capstone: existingCapstone,
      messages,
    });
  }

  const planNodes = await deps.getPlanNodesBySession(sessionId);
  if (!planNodes) {
    return err("Curriculum plan does not exist yet.");
  }

  const clusterNode = simulationNode.parentNodeId
    ? planNodes.find((node) => node.id === simulationNode.parentNodeId) ?? null
    : null;
  if (!clusterNode) {
    return err("Cluster context is missing for this simulation.");
  }

  const unitNodes = planNodes
    .filter((node) => node.parentNodeId === clusterNode.id && node.kind === "unit")
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const unitContents = await Promise.all(
    unitNodes.map((node) => deps.getUnitByNodeId(node.id)),
  );
  const availableUnitContents = unitContents.filter(
    (unit): unit is NonNullable<typeof unit> => unit != null,
  );
  const latestAttempts = await deps.listLatestAttemptsByUnitIds(
    sessionId,
    availableUnitContents.map((unit) => unit.id),
  );
  const attemptByUnitId = new Map(
    latestAttempts.map((attempt) => [attempt.unitContentId, attempt]),
  );

  const history = availableUnitContents.map((unit) => {
    const attempt = attemptByUnitId.get(unit.id);

    return {
      title: unit.title,
      summary: unit.summary,
      score: attempt?.score ?? 0,
      readiness: attempt?.readiness ?? "unknown",
      growthDimensions: attempt?.growthDimensions ?? null,
      improvements: attempt?.improvements ?? [],
      failureTags: attempt?.failureTags ?? [],
    };
  });

  const scenario = await runCapstoneAgent({
    clusterTitle: clusterNode.title,
    clusterSummary: clusterNode.summary,
    clusterWhyItMatters: clusterNode.whyItMatters,
    simulationTitle: simulationNode.title,
    simulationSummary: simulationNode.summary,
    history,
  });

  const capstone = await deps.saveCapstone({
    simulationNodeId: simulationNode.id,
    planId: simulationNode.planId,
    sessionId,
    userId,
    scenario,
    maxRounds: getCapstoneMaxRounds(scenario.format),
  });

  if (!capstone) {
    return err("Capstone could not be saved.");
  }

  const openingMessage = getInitialAssistantMessage(scenario);
  const messages = openingMessage
    ? [
        await deps.appendCapstoneMessage({
          capstoneId: capstone.id,
          role: "assistant",
          content: openingMessage,
          sequence: 0,
          round: 0,
        }),
      ].filter(
        (message): message is NonNullable<typeof message> => message != null,
      )
    : [];

  return ok({
    capstone,
    messages,
  });
};
