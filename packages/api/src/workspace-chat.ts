import type { z } from "zod/v4";
import { Output, streamText } from "ai";

import type { db as databaseClient } from "@acme/db/client";

import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "./domain/training/types/training.types";
import type {
  WorkspaceAiState,
  WorkspaceAiTurnResult,
} from "./domain/training/workspace-ai/types";
import { buildWorkspaceContextEnvelope } from "./domain/training/context-engine/build-context-envelope";
import { renderWorkspaceContextPrompt } from "./domain/training/context-engine/render-context-prompt";
import { requireAiModelForPurpose } from "./domain/training/engine/model-router";
import {
  buildWorkspaceIntroMessage,
  ensureWorkspaceUnit,
} from "./domain/training/workflows/get-ai-workspace-workflow";
import {
  normalizeEducationStageTransition,
  planWorkspaceTurn,
} from "./domain/training/workspace-ai/orchestrator";
import {
  WORKSPACE_AI_EDUCATION_UNIT_PROMPT,
  WORKSPACE_AI_RECALL_PROMPT,
} from "./domain/training/workspace-ai/prompts";
import {
  WorkspaceAiEducationOutputSchema,
  WorkspaceAiRecallOutputSchema,
} from "./domain/training/workspace-ai/types";
import { memoryRepository } from "./repositories/memory-repository";
import { trainingAttemptRepository } from "./repositories/training-attempt-repository";
import { trainingCurriculumRepository } from "./repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";

type Database = typeof databaseClient;

const encoder = new TextEncoder();

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
  output: z.infer<typeof WorkspaceAiRecallOutputSchema>;
}): Promise<WorkspaceAiTurnResult> => {
  const assistantMessage =
    await trainingOnboardingRepository.appendWorkspaceMessage({
      db,
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "recall",
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
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  state: WorkspaceAiState;
  unit: UnitContent;
  plan: CurriculumPlan;
  output: z.infer<typeof WorkspaceAiEducationOutputSchema>;
}): Promise<WorkspaceAiTurnResult> => {
  if (!state.educationStage) {
    throw new Error("Education stage is missing.");
  }

  const nextStage = normalizeEducationStageTransition({
    currentStage: state.educationStage,
    requestedStage: output.nextStage,
    stageComplete: output.stageComplete,
    unitComplete: output.unitComplete,
  });

  const assistantMessage =
    await trainingOnboardingRepository.appendWorkspaceMessage({
      db,
      sessionId,
      role: "assistant",
      content: output.assistantMessage,
      slot: "education_unit",
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
    userResponse: message,
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

export const streamWorkspaceChat = async ({
  db,
  sessionId,
  userId,
  message,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
}) => {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < 2) {
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const { plan, allResponses, state, node, unit, unitResponses } =
          await getCurrentTurn({ db, sessionId });
        const slot = getWorkspaceMessageSlot(state.mode);
        const userMessage =
          await trainingOnboardingRepository.appendWorkspaceMessage({
            db,
            sessionId,
            role: "user",
            content: trimmedMessage,
            slot,
          });

        if (!userMessage) {
          throw new Error("User message could not be saved.");
        }

        const messagesWithUser =
          await trainingOnboardingRepository.listWorkspaceMessages({
            db,
            sessionId,
            slot,
          });
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
        const contextEnvelope = buildWorkspaceContextEnvelope({
          plan,
          node,
          unit,
          state,
          messages: messagesWithUser,
          introMessage,
          memories: memoriesResult.success ? memoriesResult.data : [],
          activeUnitResponses: unitResponses,
          allResponses,
        });
        const context = renderWorkspaceContextPrompt(contextEnvelope);
        let streamedAssistantMessage = "";
        const streamAssistantDelta = (nextAssistantMessage: string) => {
          if (
            nextAssistantMessage.length > streamedAssistantMessage.length &&
            nextAssistantMessage.startsWith(streamedAssistantMessage)
          ) {
            const delta = nextAssistantMessage.slice(
              streamedAssistantMessage.length,
            );
            streamedAssistantMessage = nextAssistantMessage;
            controller.enqueue(encoder.encode(delta));
          }
        };

        if (state.mode === "recall") {
          const result = streamText({
            model: requireAiModelForPurpose("recall", "AI workspace turns"),
            output: Output.object({
              schema: WorkspaceAiRecallOutputSchema,
              name: "workspace_recall_turn",
            }),
            system: WORKSPACE_AI_RECALL_PROMPT,
            prompt: context,
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
          const result = streamText({
            model: requireAiModelForPurpose("education", "AI workspace turns"),
            output: Output.object({
              schema: WorkspaceAiEducationOutputSchema,
              name: "workspace_education_turn",
            }),
            system: WORKSPACE_AI_EDUCATION_UNIT_PROMPT,
            prompt: context,
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
          await saveEducationOutput({
            db,
            sessionId,
            userId,
            message: trimmedMessage,
            state,
            unit,
            plan,
            output,
          });
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};
