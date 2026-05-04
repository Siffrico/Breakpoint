import type { Result } from "../../../lib/result";
import type { Memory } from "../../memory/types";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/becoming.types";
import type {
  WorkspaceAiMessage,
  WorkspaceAiTurnResult,
} from "../workspace-ai/types";
import { err, ok } from "../../../lib/result";
import {
  normalizeEducationStageTransition,
  planWorkspaceTurn,
} from "../workspace-ai/orchestrator";
import { runWorkspaceAiPrompt } from "../workspace-ai/runtime";
import {
  WorkspaceAiEducationOutputSchema,
  WorkspaceAiRecallOutputSchema,
} from "../workspace-ai/types";
import { ensureWorkspaceUnit } from "./get-ai-workspace-workflow";

interface SubmitAiWorkspaceMessageDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  listMessages: (sessionId: string) => Promise<WorkspaceAiMessage[]>;
  appendMessage: (input: {
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
  }) => Promise<WorkspaceAiMessage | null>;
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
  savePhaseResponse: (input: {
    unitContentId: string;
    sessionId: string;
    userId?: string | null;
    phase: PhaseResponseRecord["phase"];
    sequence: number;
    userResponse: string;
    aiResponse?: string | null;
    passed?: boolean | null;
    score?: number | null;
    metadata?: PhaseResponseRecord["metadata"];
  }) => Promise<PhaseResponseRecord | null>;
  completeNode: (nodeId: string) => Promise<unknown>;
  listMemories: (userId: string) => Promise<Memory[]>;
  touchSession: (sessionId: string) => Promise<unknown>;
}

/**
 * Takes one user workspace message; produces the persisted AI response and next
 * workspace state; fails only when the session has no curriculum, no runnable
 * turn, invalid unit state, or the AI cannot produce schema-valid output.
 */
export const submitAiWorkspaceMessageWorkflow = async ({
  sessionId,
  userId,
  message,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  deps: SubmitAiWorkspaceMessageDependencies;
}): Promise<Result<WorkspaceAiTurnResult>> => {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < 2) {
    return err("Write a fuller message so the AI can respond usefully.");
  }

  const [plan, allResponses, memories] = await Promise.all([
    deps.getActivePlan(sessionId),
    deps.listPhaseResponsesBySession(sessionId),
    deps.listMemories(userId),
  ]);

  if (!plan) {
    return err("Curriculum is not ready yet.");
  }

  const readyUnitNode = getNextReadyLearningNode(plan.nodes);
  const readyUnit = readyUnitNode
    ? await ensureWorkspaceUnit({
        node: readyUnitNode,
        deps,
      })
    : null;
  const readyUnitResponses = readyUnit
    ? await deps.getPhaseResponses(readyUnit.id, sessionId)
    : [];

  const state = planWorkspaceTurn({
    nodes: plan.nodes,
    allResponses,
    activeUnitResponses: readyUnitResponses,
  });

  if (!state) {
    return err("There is no runnable workspace turn.");
  }

  const unitNode = findTurnNode({ nodes: plan.nodes, state });
  const unit = await ensureWorkspaceUnit({ node: unitNode, deps });
  if (!unit || !unitNode) {
    return err("Workspace unit could not be prepared.");
  }

  const userMessage = await deps.appendMessage({
    sessionId,
    role: "user",
    content: trimmedMessage,
    slot: state.mode,
  });
  if (!userMessage) {
    return err("User message could not be saved.");
  }

  const messagesWithUser = await deps.listMessages(sessionId);
  const context = formatWorkspaceContext({
    plan,
    node: unitNode,
    unit,
    state,
    messages: messagesWithUser,
    memories,
  });

  if (state.mode === "recall") {
    const output = await runWorkspaceAiPrompt({
      kind: "recall",
      schema: WorkspaceAiRecallOutputSchema,
      errorMessage: "Failed to run recall.",
      context,
    });

    const assistantMessage = await deps.appendMessage({
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "recall",
    });
    if (!assistantMessage) {
      return err("AI response could not be saved.");
    }

    const recallResponses = await deps.getPhaseResponses(unit.id, sessionId);
    await deps.savePhaseResponse({
      unitContentId: unit.id,
      sessionId,
      userId,
      phase: "ai_recall",
      sequence: recallResponses.filter(
        (response) => response.phase === "ai_recall",
      ).length,
      userResponse: trimmedMessage,
      aiResponse: output.assistantMessage,
      passed: output.recallComplete,
      score: output.score,
      metadata: {
        recallUnitId: unit.nodeId,
        feedback: output.assistantMessage,
        evidenceAnchors: output.strengths,
      },
    });

    await deps.touchSession(sessionId);
    return ok({
      state,
      messages: await deps.listMessages(sessionId),
      assistantMessage,
    });
  }

  if (!state.educationStage) {
    return err("Education stage is missing.");
  }

  const output = await runWorkspaceAiPrompt({
    kind: "education_unit",
    schema: WorkspaceAiEducationOutputSchema,
    errorMessage: "Failed to run education unit.",
    context,
  });
  const nextStage = normalizeEducationStageTransition({
    currentStage: state.educationStage,
    requestedStage: output.nextStage,
    stageComplete: output.stageComplete,
    unitComplete: output.unitComplete,
  });

  const assistantMessage = await deps.appendMessage({
    sessionId,
    role: "assistant",
    content: output.assistantMessage,
    slot: "education_unit",
  });
  if (!assistantMessage) {
    return err("AI response could not be saved.");
  }

  const educationResponses = await deps.getPhaseResponses(unit.id, sessionId);
  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_education",
    sequence: educationResponses.filter(
      (response) => response.phase === "ai_education",
    ).length,
    userResponse: trimmedMessage,
    aiResponse: output.assistantMessage,
    passed: nextStage === "completed",
    score: output.score,
    metadata: {
      aiEducationStage: nextStage,
      feedback: output.assistantMessage,
      evidenceAnchors: output.strengths,
    },
  });

  if (nextStage === "completed") {
    await deps.completeNode(unit.nodeId);
  }

  await deps.touchSession(sessionId);
  return ok({
    state: {
      ...state,
      educationStage: nextStage,
    },
    messages: await deps.listMessages(sessionId),
    assistantMessage,
  });
};

const getNextReadyLearningNode = (nodes: CurriculumNode[]) =>
  nodes.find(
    (node) =>
      (node.kind === "unit" || node.kind === "integration") &&
      node.status === "ready",
  ) ?? null;

const findTurnNode = ({
  nodes,
  state,
}: {
  nodes: CurriculumNode[];
  state: { activeUnitId: string | null; recallUnitId: string | null };
}) =>
  nodes.find(
    (node) => node.id === (state.activeUnitId ?? state.recallUnitId),
  ) ?? null;

const formatWorkspaceContext = ({
  plan,
  node,
  unit,
  state,
  messages,
  memories,
}: {
  plan: CurriculumPlan;
  node: CurriculumNode;
  unit: UnitContent;
  state: { mode: string; educationStage: string | null };
  messages: WorkspaceAiMessage[];
  memories: Memory[];
}) => `Workspace state:
Mode: ${state.mode}
Education stage: ${state.educationStage ?? "none"}

Curriculum:
Title: ${plan.title}
Target identity: ${plan.targetIdentity}
Summary: ${plan.summary}

Active unit:
Title: ${node.title}
Learning goal: ${node.learningGoal}
Summary: ${node.summary}
Why it matters: ${node.whyItMatters}
Seed scenario: ${unit.seedPrompt}
Focus areas: ${unit.scenario.focusAreas.join("; ")}

Relevant memory:
${formatMemories(memories)}

Recent transcript:
${formatMessages(messages)}`;

const formatMemories = (memories: Memory[]) =>
  memories.length > 0
    ? memories
        .slice(0, 12)
        .map((memory, index) => `${index + 1}. ${memory.content}`)
        .join("\n")
    : "No saved memory is available.";

const formatMessages = (messages: WorkspaceAiMessage[]) =>
  messages
    .slice(-18)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
