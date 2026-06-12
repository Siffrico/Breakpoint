import type { Result } from "../../../lib/result";
import type { Memory } from "../../memory/types";
import type {
  CurriculumNode,
  CurriculumPlan,
  Debrief,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type {
  AttemptTiming,
  WorkspaceAiEducationOutput,
  WorkspaceAiEvaluationOutput,
  WorkspaceAiMessage,
  WorkspaceAiRecallOutput,
  WorkspaceAiTurnResult,
} from "../workspace-ai/types";
import { err, ok } from "../../../lib/result";
import { buildWorkspaceContextEnvelope } from "../context-engine/build-context-envelope";
import { renderWorkspaceStageContextPrompt } from "../context-engine/render-context-prompt";
import {
  compactTranscript,
  createSummarizer,
} from "../engine/compaction";
import { getAiModelForPurpose } from "../engine/model-router";
import {
  hasFailedEvaluationAttempt,
  normalizeEvaluationPlan,
  selectLatestEvaluationPlan,
} from "../workspace-ai/evaluation-plan";
import {
  normalizeEducationStageTransition,
  planWorkspaceTurn,
} from "../workspace-ai/orchestrator";
import { runWorkspaceAiPrompt } from "../workspace-ai/runtime";
import { selectWorkspaceTurnRuntime } from "../workspace-ai/stage-runtime";
import {
  buildWorkspaceIntroMessage,
  ensureWorkspaceUnit,
} from "./get-ai-workspace-workflow";

interface SubmitAiWorkspaceMessageDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  listMessages: (
    sessionId: string,
    slot?: "education_unit" | "recall",
  ) => Promise<WorkspaceAiMessage[]>;
  getWorkspaceSummary: (
    sessionId: string,
    slot: "education_unit" | "recall",
  ) => Promise<{
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  } | null>;
  upsertWorkspaceSummary: (input: {
    sessionId: string;
    slot: "education_unit" | "recall";
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  }) => Promise<void>;
  appendMessage: (input: {
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
    unitId?: string | null;
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
  attemptTiming,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  attemptTiming?: AttemptTiming | null;
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
  const turnUnitResponses =
    unit.id === readyUnit?.id
      ? readyUnitResponses
      : await deps.getPhaseResponses(unit.id, sessionId);

  const userMessage = await deps.appendMessage({
    sessionId,
    role: "user",
    content: trimmedMessage,
    slot: getWorkspaceMessageSlot(state.mode),
    unitId: unit.nodeId,
  });
  if (!userMessage) {
    return err("User message could not be saved.");
  }

  const messagesWithUser = await deps.listMessages(
    sessionId,
    getWorkspaceMessageSlot(state.mode),
  );
  const slot = getWorkspaceMessageSlot(state.mode);
  const storedSummary = await deps.getWorkspaceSummary(sessionId, slot);
  const summarizeModel = getAiModelForPurpose("recall");
  const compaction = summarizeModel
    ? await compactTranscript({
        messages: messagesWithUser,
        previousSummary: storedSummary?.summary ?? null,
        previousCoverage: storedSummary?.coveredThroughUnitId ?? null,
        previousCoverageSequence:
          storedSummary?.coveredThroughSequence ?? null,
        summarize: createSummarizer(summarizeModel),
      })
    : null;
  if (compaction?.summaryChanged && compaction.summary) {
    await deps.upsertWorkspaceSummary({
      sessionId,
      slot,
      summary: compaction.summary,
      coveredThroughUnitId: compaction.coverage,
      coveredThroughSequence: compaction.coverageSequence,
    });
  }
  const verbatimMessages = compaction?.messages ?? messagesWithUser;
  const progressSummary =
    compaction?.summary ?? storedSummary?.summary ?? null;
  const introMessage =
    state.mode === "recall" &&
    !messagesWithUser.some((message) => message.role === "assistant")
      ? buildWorkspaceIntroMessage({
          plan,
          state,
        })
      : null;
  const runtime = selectWorkspaceTurnRuntime(state);
  const activeEvaluationPlan = selectLatestEvaluationPlan(turnUnitResponses);
  const contextEnvelope = buildWorkspaceContextEnvelope({
    plan,
    node: unitNode,
    unit,
    state,
    messages: verbatimMessages,
    introMessage,
    memories,
    progressSummary,
    activeUnitResponses: turnUnitResponses,
    allResponses,
    runtime,
    evaluationPlan: activeEvaluationPlan,
    attemptTiming,
  });
  const context = renderWorkspaceStageContextPrompt({
    envelope: contextEnvelope,
    runtime,
  });

  if (state.mode === "recall") {
    const output = (await runWorkspaceAiPrompt({
      kind: runtime.promptKind,
      schema: runtime.outputSchema,
      errorMessage: "Failed to run recall.",
      context,
    })) as WorkspaceAiRecallOutput;

    const assistantMessage = await deps.appendMessage({
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "recall",
      unitId: unit.nodeId,
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
        promptKind: runtime.promptKind,
        modelPurpose: runtime.modelPurpose,
        feedback: output.assistantMessage,
        evidenceAnchors: output.strengths,
      },
    });

    await deps.touchSession(sessionId);

    const nextState = await planNextWorkspaceTurn({
      sessionId,
      plan,
      deps,
    });

    return ok({
      state: nextState ?? state,
      messages: await deps.listMessages(sessionId, "recall"),
      assistantMessage,
    });
  }

  if (!state.educationStage) {
    return err("Education stage is missing.");
  }

  const output = (await runWorkspaceAiPrompt({
    kind: runtime.promptKind,
    schema: runtime.outputSchema,
    errorMessage: "Failed to run education unit.",
    context,
  })) as WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  const evaluationPlan =
    "evaluationPlan" in output
      ? normalizeEvaluationPlan({
          plan: output.evaluationPlan,
          isRetryAfterFailure: hasFailedEvaluationAttempt(turnUnitResponses),
        })
      : null;
  const priorEvaluationAttempts = turnUnitResponses.filter(
    (response) =>
      response.phase === "ai_education" &&
      response.metadata?.promptKind === "evaluate_feedback" &&
      response.metadata.nextScenarioPrompt !== true,
  ).length;
  const evaluationComplete =
    !evaluationPlan ||
    priorEvaluationAttempts + 1 >= evaluationPlan.scenarioCount;
  const stageComplete = output.stageComplete && evaluationComplete;
  const nextStage = normalizeEducationStageTransition({
    currentStage: state.educationStage,
    requestedStage: output.nextStage,
    stageComplete,
    unitComplete: output.unitComplete && evaluationComplete,
    allowRepairRoute:
      "routingDecision" in output && output.routingDecision === "repair",
  });

  const assistantMessage = await deps.appendMessage({
    sessionId,
    role: "assistant",
    content: output.assistantMessage,
    slot: "education_unit",
    unitId: unit.nodeId,
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
      promptKind: runtime.promptKind,
      modelPurpose: runtime.modelPurpose,
      routingDecision:
        "routingDecision" in output ? output.routingDecision : undefined,
      evaluationSummary:
        "evaluationSummary" in output ? output.evaluationSummary : undefined,
      failedDimensions:
        "failedDimensions" in output ? output.failedDimensions : undefined,
      evaluationPlan:
        "evaluationPlan" in output
          ? (evaluationPlan ?? output.evaluationPlan)
          : undefined,
      attemptTiming: attemptTiming ?? undefined,
      feedback: output.assistantMessage,
      evidenceAnchors:
        "evidenceCitations" in output
          ? output.evidenceCitations
          : output.strengths,
    },
  });

  if (nextStage === "completed") {
    await deps.saveAttempt({
      sessionId,
      userId,
      unitId: unit.id,
      response: trimmedMessage,
      debrief: {
        seedResponse: "",
        finalArticulation: trimmedMessage,
        growthDimensions:
          output.strengths.length > 0
            ? output.strengths
            : ["Completed the unit."],
        score: output.score ?? 0,
        readiness: "ready_for_next_unit",
        strengths:
          output.strengths.length > 0
            ? output.strengths
            : ["Completed the unit."],
        improvements:
          output.improvements.length > 0
            ? output.improvements
            : ["Continue applying this under realistic constraints."],
        failureTags: output.improvements,
        nextStep: "Continue to the next training unit.",
      },
      finalArticulation: trimmedMessage,
      growthDimensions: output.strengths,
    });
    await deps.completeNode(unit.nodeId);
  }

  await deps.touchSession(sessionId);

  const nextState = await planNextWorkspaceTurn({
    sessionId,
    plan: {
      ...plan,
      nodes:
        nextStage === "completed"
          ? plan.nodes.map((node) =>
              node.id === unit.nodeId ? { ...node, status: "completed" } : node,
            )
          : plan.nodes,
    },
    deps,
  });

  return ok({
    state:
      nextState ??
      ({
        ...state,
        educationStage: nextStage,
      } as WorkspaceAiTurnResult["state"]),
    messages: await deps.listMessages(
      sessionId,
      nextState ? getWorkspaceMessageSlot(nextState.mode) : "education_unit",
    ),
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

const getWorkspaceMessageSlot = (mode: "education_unit" | "recall") =>
  mode === "recall" ? "recall" : "education_unit";

const planNextWorkspaceTurn = async ({
  sessionId,
  plan,
  deps,
}: {
  sessionId: string;
  plan: CurriculumPlan;
  deps: Pick<
    SubmitAiWorkspaceMessageDependencies,
    | "listPhaseResponsesBySession"
    | "getPhaseResponses"
    | "getUnitByNodeId"
    | "createUnitContent"
  >;
}) => {
  const allResponses = await deps.listPhaseResponsesBySession(sessionId);
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

  return planWorkspaceTurn({
    nodes: plan.nodes,
    allResponses,
    activeUnitResponses: readyUnitResponses,
  });
};
