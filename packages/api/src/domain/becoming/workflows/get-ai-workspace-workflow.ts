import type { Result } from "../../../lib/result";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/becoming.types";
import type {
  WorkspaceAiMessage,
  WorkspaceAiState,
} from "../workspace-ai/types";
import { err, ok } from "../../../lib/result";
import { planWorkspaceTurn } from "../workspace-ai/orchestrator";

interface GetAiWorkspaceDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  listMessages: (
    sessionId: string,
    slot?: "education_unit" | "recall",
  ) => Promise<WorkspaceAiMessage[]>;
  listPhaseResponsesBySession: (
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  createUnitContent: (input: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
  }) => Promise<UnitContent | null>;
}

export interface AiWorkspaceView {
  plan: CurriculumPlan;
  state: WorkspaceAiState | null;
  messages: WorkspaceAiMessage[];
  introMessage: {
    prompt: string;
    helper: string | null;
  } | null;
}

/**
 * Takes a learning session id; produces the current AI workspace view; fails
 * only when the curriculum does not exist or the active unit cannot be prepared.
 */
export const getAiWorkspaceWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GetAiWorkspaceDependencies;
}): Promise<Result<AiWorkspaceView>> => {
  const [plan, messages, allResponses] = await Promise.all([
    deps.getActivePlan(sessionId),
    deps.listMessages(sessionId),
    deps.listPhaseResponsesBySession(sessionId),
  ]);

  if (!plan) {
    return err("Curriculum is not ready yet.");
  }

  const activeUnitNode = getNextReadyLearningNode(plan.nodes);
  const activeUnit = activeUnitNode
    ? await ensureWorkspaceUnit({
        node: activeUnitNode,
        deps,
      })
    : null;
  const activeUnitResponses = activeUnit
    ? await deps.getPhaseResponses(activeUnit.id, sessionId)
    : [];

  const state = planWorkspaceTurn({
    nodes: plan.nodes,
    allResponses,
    activeUnitResponses,
  });

  if (state?.activeUnitId && !activeUnit) {
    return err("Active education unit could not be prepared.");
  }

  if (state?.recallUnitId) {
    const unit = await ensureWorkspaceUnit({
      node: plan.nodes.find((node) => node.id === state.recallUnitId) ?? null,
      deps,
    });
    if (!unit) {
      return err("Recall unit could not be prepared.");
    }
  }

  const activeMessages = state
    ? await deps.listMessages(sessionId, getWorkspaceMessageSlot(state.mode))
    : messages;

  return ok({
    plan,
    state,
    messages: activeMessages,
    introMessage: buildWorkspaceIntroMessage({
      plan,
      state,
    }),
  });
};

const getNextReadyLearningNode = (nodes: CurriculumNode[]) =>
  nodes.find(
    (node) =>
      (node.kind === "unit" || node.kind === "integration") &&
      node.status === "ready",
  ) ?? null;

const getWorkspaceMessageSlot = (mode: WorkspaceAiState["mode"]) =>
  mode === "recall" ? "recall" : "education_unit";

export const buildWorkspaceIntroMessage = ({
  plan,
  state,
}: {
  plan: CurriculumPlan;
  state: WorkspaceAiState | null;
}) => {
  if (!state || state.mode !== "recall" || !state.recallUnitId) {
    return null;
  }

  const recallUnit = plan.nodes.find((node) => node.id === state.recallUnitId);
  if (!recallUnit) {
    return null;
  }

  return {
    helper: "Recall",
    prompt: `Return to ${recallUnit.title}. Reconstruct the key distinction, mechanism, or procedure from memory before you move on.`,
  };
};

export const ensureWorkspaceUnit = async ({
  node,
  deps,
}: {
  node: CurriculumNode | null;
  deps: Pick<
    GetAiWorkspaceDependencies,
    "getUnitByNodeId" | "createUnitContent"
  >;
}) => {
  if (!node) {
    return null;
  }

  const existingUnit = await deps.getUnitByNodeId(node.id);
  if (existingUnit) {
    return existingUnit;
  }

  return deps.createUnitContent({
    nodeId: node.id,
    title: node.title,
    seedPrompt: `You are in a real situation where ${node.summary} matters. What would you do first, and what would you watch for?`,
    seedHint:
      "Answer with the concrete move you would make, the reason for it, and the signal that would tell you whether it is working.",
    clusterArcFrame: node.whyItMatters,
    complexityBudget: 1,
    teachbackSetup: {
      studentPersona: "A skeptical peer who needs the idea made practical.",
      openingMisconception:
        "The learner can describe the topic but has not yet shown reliable transfer.",
      roundLadder: [
        {
          round: 1,
          objection: "Why does this matter in a real case?",
          objective: "Test practical grounding.",
        },
        {
          round: 2,
          objection: "What would break if you applied it too simply?",
          objective: "Test boundaries.",
        },
        {
          round: 3,
          objection: "How would you explain the tradeoff under pressure?",
          objective: "Test transfer.",
        },
      ],
      passSignals: ["Names the mechanism", "Applies it in context"],
      failureModes: ["Stays abstract", "Misses the boundary condition"],
    },
    scenario: {
      title: node.title,
      focusAreas: [node.summary, node.whyItMatters].filter(Boolean).slice(0, 2),
    },
  });
};
