import type { UIMessage } from "ai";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  Output,
  stepCountIs,
  streamText,
} from "ai";

import type { db as databaseClient } from "@acme/db/client";

import type {
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "./domain/training/types/training.types";
import type {
  AttemptTiming,
  WorkspaceAiEducationOutput,
  WorkspaceAiEvaluationOutput,
  WorkspaceAiRecallOutput,
  WorkspaceAiState,
  WorkspaceAiTurnResult,
} from "./domain/training/workspace-ai/types";
import { buildWorkspaceContextEnvelope } from "./domain/training/context-engine/build-context-envelope";
import { renderWorkspaceStageContextPrompt } from "./domain/training/context-engine/render-context-prompt";
import {
  compactTranscript,
  createSummarizer,
} from "./domain/training/engine/compaction";
import {
  getAiModelForPurpose,
  getSearchToolsForSelectedProvider,
  requireAiModelForPurpose,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import {
  buildWorkspaceIntroMessage,
  ensureWorkspaceUnit,
} from "./domain/training/workflows/get-ai-workspace-workflow";
import {
  hasFailedEvaluationAttempt,
  normalizeEvaluationPlan,
  selectLatestEvaluationPlan,
} from "./domain/training/workspace-ai/evaluation-plan";
import {
  normalizeEducationStageTransition,
  planWorkspaceTurn,
} from "./domain/training/workspace-ai/orchestrator";
import { getWorkspaceAiSystemPrompt } from "./domain/training/workspace-ai/runtime";
import { selectWorkspaceTurnRuntime } from "./domain/training/workspace-ai/stage-runtime";
import {
  WorkspaceAiEducationOutputSchema,
  WorkspaceAiEvaluationOutputSchema,
  WorkspaceAiRecallOutputSchema,
} from "./domain/training/workspace-ai/types";
import { memoryRepository } from "./repositories/memory-repository";
import { trainingAttemptRepository } from "./repositories/training-attempt-repository";
import { trainingCurriculumRepository } from "./repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";

type Database = typeof databaseClient;

type WorkspaceStreamStatus =
  | "preparing"
  | "thinking"
  | "evaluating"
  | "saving"
  | "complete";

interface WorkspaceStatusData extends Record<string, unknown> {
  "workspace-status": {
    status: WorkspaceStreamStatus;
    label: string;
  };
}

type WorkspaceChatUIMessage = UIMessage<unknown, WorkspaceStatusData>;

const WORKSPACE_ASSISTANT_TEXT_PART_ID = "workspace-assistant";

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

const getCurrentTurn = async ({
  db,
  sessionId,
}: {
  db: Database;
  sessionId: string;
}) => {
  const [plan, allResponses] = await Promise.all([
    trainingCurriculumRepository.getActivePlan({ db, sessionId }),
    trainingCurriculumRepository.listPhaseResponsesBySession({ db, sessionId }),
  ]);

  if (!plan) {
    throw new Error("Curriculum is not ready yet.");
  }

  const readyUnitNode = getNextReadyLearningNode(plan.nodes);
  const readyUnit = readyUnitNode
    ? await ensureWorkspaceUnit({
        node: readyUnitNode,
        deps: {
          getUnitByNodeId: (nodeId) =>
            trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
          createUnitContent: (payload) =>
            trainingCurriculumRepository.createUnitContent({
              db,
              ...payload,
            }),
        },
      })
    : null;
  const readyUnitResponses = readyUnit
    ? await trainingCurriculumRepository.getPhaseResponses({
        db,
        unitContentId: readyUnit.id,
        sessionId,
      })
    : [];

  const state = planWorkspaceTurn({
    nodes: plan.nodes,
    allResponses,
    activeUnitResponses: readyUnitResponses,
  });

  if (!state) {
    throw new Error("There is no runnable workspace turn.");
  }

  const node = findTurnNode({ nodes: plan.nodes, state });
  const unit = await ensureWorkspaceUnit({
    node,
    deps: {
      getUnitByNodeId: (nodeId) =>
        trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
      createUnitContent: (payload) =>
        trainingCurriculumRepository.createUnitContent({
          db,
          ...payload,
        }),
    },
  });

  if (!unit || !node) {
    throw new Error("Workspace unit could not be prepared.");
  }

  const unitResponses =
    unit.id === readyUnit?.id
      ? readyUnitResponses
      : await trainingCurriculumRepository.getPhaseResponses({
          db,
          unitContentId: unit.id,
          sessionId,
        });

  return { plan, allResponses, state, node, unit, unitResponses };
};

const planNextWorkspaceTurn = async ({
  db,
  sessionId,
  plan,
}: {
  db: Database;
  sessionId: string;
  plan: CurriculumPlan;
}) => {
  const allResponses =
    await trainingCurriculumRepository.listPhaseResponsesBySession({
      db,
      sessionId,
    });
  const readyUnitNode = getNextReadyLearningNode(plan.nodes);
  const readyUnit = readyUnitNode
    ? await ensureWorkspaceUnit({
        node: readyUnitNode,
        deps: {
          getUnitByNodeId: (nodeId) =>
            trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
          createUnitContent: (payload) =>
            trainingCurriculumRepository.createUnitContent({
              db,
              ...payload,
            }),
        },
      })
    : null;
  const readyUnitResponses = readyUnit
    ? await trainingCurriculumRepository.getPhaseResponses({
        db,
        unitContentId: readyUnit.id,
        sessionId,
      })
    : [];

  return planWorkspaceTurn({
    nodes: plan.nodes,
    allResponses,
    activeUnitResponses: readyUnitResponses,
  });
};

const saveRecallOutput = async ({
  db,
  sessionId,
  userId,
  message,
  state,
  unit,
  plan,
  output,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  state: WorkspaceAiState;
  unit: UnitContent;
  plan: CurriculumPlan;
  output: WorkspaceAiRecallOutput;
}): Promise<WorkspaceAiTurnResult> => {
  const assistantMessage =
    await trainingOnboardingRepository.appendWorkspaceMessage({
      db,
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "recall",
      unitId: unit.nodeId,
    });

  if (!assistantMessage) {
    throw new Error("AI response could not be saved.");
  }

  const recallResponses = await trainingCurriculumRepository.getPhaseResponses({
    db,
    unitContentId: unit.id,
    sessionId,
  });
  await trainingCurriculumRepository.savePhaseResponse({
    db,
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_recall",
    sequence: recallResponses.filter(
      (response) => response.phase === "ai_recall",
    ).length,
    userResponse: message,
    aiResponse: output.assistantMessage,
    passed: output.recallComplete,
    score: output.score,
    metadata: {
      recallUnitId: unit.nodeId,
      promptKind: "recall",
      modelPurpose: "recall",
      feedback: output.assistantMessage,
      evidenceAnchors: output.strengths,
    },
  });

  await trainingOnboardingRepository.touchSession({ db, sessionId });

  const nextState = await planNextWorkspaceTurn({ db, sessionId, plan });

  return {
    state: nextState ?? state,
    messages: await trainingOnboardingRepository.listWorkspaceMessages({
      db,
      sessionId,
      slot: "recall",
    }),
    assistantMessage,
  };
};

const saveEducationOutput = async ({
  db,
  sessionId,
  userId,
  message,
  state,
  unit,
  plan,
  output,
  attemptTiming,
  evaluationPlan,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  state: WorkspaceAiState;
  unit: UnitContent;
  plan: CurriculumPlan;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  attemptTiming?: AttemptTiming | null;
  evaluationPlan?: WorkspaceAiEvaluationOutput["evaluationPlan"] | null;
}): Promise<WorkspaceAiTurnResult> => {
  if (!state.educationStage) {
    throw new Error("Education stage is missing.");
  }

  const educationResponses =
    await trainingCurriculumRepository.getPhaseResponses({
      db,
      unitContentId: unit.id,
      sessionId,
    });
  const priorEvaluationAttempts = educationResponses.filter(
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

  const assistantMessage =
    await trainingOnboardingRepository.appendWorkspaceMessage({
      db,
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "education_unit",
      unitId: unit.nodeId,
    });

  if (!assistantMessage) {
    throw new Error("AI response could not be saved.");
  }

  await trainingCurriculumRepository.savePhaseResponse({
    db,
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_education",
    sequence: educationResponses.filter(
      (response) => response.phase === "ai_education",
    ).length,
    userResponse: message,
    aiResponse: output.assistantMessage,
    passed: nextStage === "completed",
    score: output.score,
    metadata: {
      aiEducationStage: nextStage,
      promptKind:
        "routingDecision" in output ? "evaluate_feedback" : "education_unit",
      modelPurpose: "routingDecision" in output ? "evaluation" : "education",
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
    await trainingAttemptRepository.saveAttempt({
      db,
      sessionId,
      userId,
      unitId: unit.id,
      response: message,
      debrief: {
        seedResponse: "",
        finalArticulation: message,
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
      finalArticulation: message,
      growthDimensions: output.strengths,
    });
    await trainingCurriculumRepository.completeNode({
      db,
      nodeId: unit.nodeId,
    });
  }

  await trainingOnboardingRepository.touchSession({ db, sessionId });

  const nextState = await planNextWorkspaceTurn({
    db,
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
  });

  return {
    state:
      nextState ??
      ({
        ...state,
        educationStage: nextStage,
      } as WorkspaceAiTurnResult["state"]),
    messages: await trainingOnboardingRepository.listWorkspaceMessages({
      db,
      sessionId,
      slot: nextState
        ? getWorkspaceMessageSlot(nextState.mode)
        : "education_unit",
    }),
    assistantMessage,
  };
};

const saveNextScenarioPrompt = async ({
  db,
  sessionId,
  userId,
  unit,
  output,
  evaluationPlan,
  currentStage,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  unit: UnitContent;
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  evaluationPlan?: WorkspaceAiEvaluationOutput["evaluationPlan"] | null;
  currentStage: WorkspaceAiState["educationStage"];
}) => {
  if (!currentStage) {
    throw new Error("Education stage is missing.");
  }

  const assistantMessage =
    await trainingOnboardingRepository.appendWorkspaceMessage({
      db,
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "education_unit",
      unitId: unit.nodeId,
    });

  if (!assistantMessage) {
    throw new Error("AI response could not be saved.");
  }

  const educationResponses =
    await trainingCurriculumRepository.getPhaseResponses({
      db,
      unitContentId: unit.id,
      sessionId,
    });

  await trainingCurriculumRepository.savePhaseResponse({
    db,
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "ai_education",
    sequence: educationResponses.filter(
      (response) => response.phase === "ai_education",
    ).length,
    userResponse: "[next_scenario_requested]",
    aiResponse: output.assistantMessage,
    passed: null,
    score: null,
    metadata: {
      aiEducationStage: currentStage,
      promptKind: "evaluate_feedback",
      modelPurpose: "evaluation",
      nextScenarioPrompt: true,
      evaluationPlan:
        "evaluationPlan" in output
          ? (evaluationPlan ?? output.evaluationPlan)
          : undefined,
      feedback: output.assistantMessage,
    },
  });

  await trainingOnboardingRepository.touchSession({ db, sessionId });
};

export const streamWorkspaceChat = async ({
  db,
  sessionId,
  userId,
  message,
  modelName,
  attemptTiming,
  action = "submit_answer",
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  modelName?: string | null;
  attemptTiming?: AttemptTiming | null;
  action?: "submit_answer" | "next_scenario";
}) =>
  withAiModelPreference(modelName, () =>
    streamWorkspaceChatWithModelPreference({
      db,
      sessionId,
      userId,
      message,
      attemptTiming,
      action,
    }),
  );

const streamWorkspaceChatWithModelPreference = async ({
  db,
  sessionId,
  userId,
  message,
  attemptTiming,
  action,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  attemptTiming?: AttemptTiming | null;
  action: "submit_answer" | "next_scenario";
}) => {
  const trimmedMessage = message.trim();
  if (action === "submit_answer" && trimmedMessage.length < 2) {
    return new Response(
      "Write a fuller message so the AI can respond usefully.",
      {
        status: 400,
      },
    );
  }

  const session = await trainingOnboardingRepository.getSession({
    db,
    sessionId,
  });
  if (!session) {
    return new Response("Onboarding session not found.", { status: 404 });
  }
  if (session.userId !== userId) {
    return new Response("Forbidden.", { status: 403 });
  }

  const stream = createUIMessageStream<WorkspaceChatUIMessage>({
    onError: () => "AI feedback could not be prepared.",
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({
        type: "data-workspace-status",
        id: "workspace-status",
        data: {
          status: "preparing",
          label:
            action === "next_scenario"
              ? "Preparing next scenario"
              : "Preparing feedback",
        },
      });

      let textPartStarted = false;
      let streamedAssistantMessage = "";
      const writeStatus = (status: WorkspaceStreamStatus, label: string) => {
        writer.write({
          type: "data-workspace-status",
          id: "workspace-status",
          data: { status, label },
        });
      };
      const streamAssistantDelta = (nextAssistantMessage: string) => {
        if (
          nextAssistantMessage.length <= streamedAssistantMessage.length ||
          !nextAssistantMessage.startsWith(streamedAssistantMessage)
        ) {
          return;
        }

        const delta = nextAssistantMessage.slice(
          streamedAssistantMessage.length,
        );
        if (!delta) return;

        if (!textPartStarted) {
          writer.write({
            type: "text-start",
            id: WORKSPACE_ASSISTANT_TEXT_PART_ID,
          });
          textPartStarted = true;
        }
        streamedAssistantMessage = nextAssistantMessage;
        writer.write({
          type: "text-delta",
          id: WORKSPACE_ASSISTANT_TEXT_PART_ID,
          delta,
        });
      };
      const endAssistantText = () => {
        if (!textPartStarted) return;
        writer.write({
          type: "text-end",
          id: WORKSPACE_ASSISTANT_TEXT_PART_ID,
        });
      };

      const { plan, allResponses, state, node, unit, unitResponses } =
        await getCurrentTurn({ db, sessionId });
      const slot = getWorkspaceMessageSlot(state.mode);
      if (action === "submit_answer") {
        const userMessage =
          await trainingOnboardingRepository.appendWorkspaceMessage({
            db,
            sessionId,
            role: "user",
            content: trimmedMessage,
            slot,
            unitId: unit.nodeId,
          });

        if (!userMessage) {
          throw new Error("User message could not be saved.");
        }
      }

      const messagesWithUser =
        await trainingOnboardingRepository.listWorkspaceMessages({
          db,
          sessionId,
          slot,
        });

      // Compaction: keep the most recent units verbatim and fold older units
      // into an anchored rolling summary. The summarizer only runs when a new
      // unit has aged out (most turns reuse the stored summary, no LLM call).
      const storedSummary =
        await trainingOnboardingRepository.getWorkspaceSummary({
          db,
          sessionId,
          slot,
        });
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
        await trainingOnboardingRepository.upsertWorkspaceSummary({
          db,
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
        !messagesWithUser.some(
          (workspaceMessage) => workspaceMessage.role === "assistant",
        )
          ? buildWorkspaceIntroMessage({ plan, state })
          : null;
      const memoriesResult = await memoryRepository.listByUserId({
        db,
        userId,
      });
      const runtime = selectWorkspaceTurnRuntime(state);
      const activeEvaluationPlan = selectLatestEvaluationPlan(unitResponses);
      const contextEnvelope = buildWorkspaceContextEnvelope({
        plan,
        node,
        unit,
        state,
        messages: verbatimMessages,
        introMessage,
        memories: memoriesResult.success ? memoriesResult.data : [],
        progressSummary,
        activeUnitResponses: unitResponses,
        allResponses,
        runtime,
        evaluationPlan: activeEvaluationPlan,
        attemptTiming,
      });
      const context = renderWorkspaceStageContextPrompt({
        envelope: contextEnvelope,
        runtime,
      });
      const promptContext =
        action === "next_scenario"
          ? `${context}\n\n## Turn instruction\nThe learner clicked Next scenario after reading evaluator feedback. Generate the next planned evaluation scenario only. Do not treat this as a learner answer. Do not re-grade the previous answer. Keep the current evaluation stage active unless this prompt is impossible.`
          : context;

      if (state.mode === "recall") {
        writeStatus("thinking", "Checking recall");
        const result = streamText({
          model: requireAiModelForPurpose(
            runtime.modelPurpose,
            "AI workspace turns",
          ),
          output: Output.object({
            schema: WorkspaceAiRecallOutputSchema,
            name: "workspace_recall_turn",
          }),
          system: getWorkspaceAiSystemPrompt(runtime.promptKind),
          prompt: promptContext,
          tools: getSearchToolsForSelectedProvider(runtime.modelPurpose),
          stopWhen: stepCountIs(4),
        });

        for await (const partial of result.partialOutputStream) {
          streamAssistantDelta(
            typeof partial.assistantMessage === "string"
              ? partial.assistantMessage
              : "",
          );
        }

        const output = await result.output;
        streamAssistantDelta(output.assistantMessage);
        endAssistantText();
        writeStatus("saving", "Saving feedback");
        await saveRecallOutput({
          db,
          sessionId,
          userId,
          message: trimmedMessage,
          state,
          unit,
          plan,
          output,
        });
      } else {
        writeStatus(
          runtime.promptKind === "evaluate_feedback"
            ? "evaluating"
            : "thinking",
          action === "next_scenario"
            ? "Preparing next scenario"
            : runtime.promptKind === "evaluate_feedback"
              ? "Evaluating your answer"
              : "Preparing feedback",
        );
        const educationSchema =
          runtime.promptKind === "evaluate_feedback"
            ? WorkspaceAiEvaluationOutputSchema
            : WorkspaceAiEducationOutputSchema;
        const result = streamText({
          model: requireAiModelForPurpose(
            runtime.modelPurpose,
            "AI workspace turns",
          ),
          output: Output.object({
            schema: educationSchema,
            name: "workspace_education_turn",
          }),
          system: getWorkspaceAiSystemPrompt(runtime.promptKind),
          prompt: promptContext,
          tools: getSearchToolsForSelectedProvider(runtime.modelPurpose),
          stopWhen: stepCountIs(4),
        });

        for await (const partial of result.partialOutputStream) {
          streamAssistantDelta(
            typeof partial.assistantMessage === "string"
              ? partial.assistantMessage
              : "",
          );
        }

        const output = (await result.output) as unknown as
          | WorkspaceAiEducationOutput
          | WorkspaceAiEvaluationOutput;
        const evaluationPlan =
          "evaluationPlan" in output
            ? normalizeEvaluationPlan({
                plan: output.evaluationPlan,
                isRetryAfterFailure: hasFailedEvaluationAttempt(unitResponses),
              })
            : null;
        streamAssistantDelta(output.assistantMessage);
        endAssistantText();
        writeStatus(
          "saving",
          action === "next_scenario"
            ? "Saving next scenario"
            : "Saving feedback",
        );
        if (action === "next_scenario") {
          await saveNextScenarioPrompt({
            db,
            sessionId,
            userId,
            unit,
            output,
            evaluationPlan,
            currentStage: state.educationStage,
          });
        } else {
          await saveEducationOutput({
            db,
            sessionId,
            userId,
            message: trimmedMessage,
            state,
            unit,
            plan,
            output,
            attemptTiming,
            evaluationPlan,
          });
        }
      }

      writeStatus("complete", "Complete");
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};
