import type { UIMessage } from "ai";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  Output,
  stepCountIs,
  streamText,
} from "ai";

import type { db as databaseClient } from "@acme/db/client";

import type { UnitContent } from "./domain/training/types/training.types";
import type {
  AttemptTiming,
  WorkspaceAiEducationOutput,
} from "./domain/training/workspace-ai/types";
import type {
  ManualDifficultySignal,
  WorkspaceChatAction,
} from "./domain/training/workspace-ai/workspace-turn-orchestration";
import {
  getSearchToolsForSelectedProvider,
  requireAiModelForPurpose,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import { createInitialRatingState } from "./domain/training/engine/rating";
import {
  prepareScenarioDirective,
  recordEvaluation,
} from "./domain/training/orchestration/goldilocks";
import { getWorkspaceAiSystemPrompt } from "./domain/training/workspace-ai/runtime";
import {
  completeWorkspaceTurn,
  parseWorkspaceTurnOutput,
  prepareWorkspaceTurnPrompt,
} from "./domain/training/workspace-ai/workspace-turn-orchestration";
import { memoryRepository } from "./repositories/memory-repository";
import { trainingAttemptRepository } from "./repositories/training-attempt-repository";
import { trainingCurriculumRepository } from "./repositories/training-curriculum-repository";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";
import { trainingRatingRepository } from "./repositories/training-rating-repository";

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

const createWorkspaceTurnRepositoryDeps = (db: Database) => ({
  getActivePlan: (sessionId: string) =>
    trainingCurriculumRepository.getActivePlan({ db, sessionId }),
  listMessages: (sessionId: string, slot?: "education_unit" | "recall") =>
    trainingOnboardingRepository.listWorkspaceMessages({
      db,
      sessionId,
      slot,
    }),
  getWorkspaceSummary: (sessionId: string, slot: "education_unit" | "recall") =>
    trainingOnboardingRepository.getWorkspaceSummary({
      db,
      sessionId,
      slot,
    }),
  upsertWorkspaceSummary: (payload: {
    sessionId: string;
    slot: "education_unit" | "recall";
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  }) =>
    trainingOnboardingRepository.upsertWorkspaceSummary({
      db,
      ...payload,
    }),
  appendMessage: (payload: {
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
    unitId?: string | null;
    metadata?: { difficultyDirectiveReason?: string } | null;
  }) =>
    trainingOnboardingRepository.appendWorkspaceMessage({
      db,
      ...payload,
    }),
  listPhaseResponsesBySession: (sessionId: string) =>
    trainingCurriculumRepository.listPhaseResponsesBySession({
      db,
      sessionId,
    }),
  getPhaseResponses: (unitContentId: string, sessionId: string) =>
    trainingCurriculumRepository.getPhaseResponses({
      db,
      unitContentId,
      sessionId,
    }),
  getUnitByNodeId: (nodeId: string) =>
    trainingCurriculumRepository.getUnitByNodeId({ db, nodeId }),
  createUnitContent: (payload: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
    unitMasteryContract?: UnitContent["unitMasteryContract"];
  }) =>
    trainingCurriculumRepository.createUnitContent({
      db,
      ...payload,
    }),
  savePhaseResponse: (
    payload: Omit<
      Parameters<typeof trainingCurriculumRepository.savePhaseResponse>[0],
      "db"
    >,
  ) =>
    trainingCurriculumRepository.savePhaseResponse({
      db,
      ...payload,
    }),
  updateUnitMasteryContract: (payload: {
    unitContentId: string;
    unitMasteryContract: UnitContent["unitMasteryContract"];
  }) =>
    trainingCurriculumRepository.updateUnitMasteryContract({
      db,
      ...payload,
    }),
  updateOpenScenarioContract: (payload: {
    userId: string;
    nodeId: string;
    scenarioPrompt: string;
    scenarioContract: NonNullable<
      WorkspaceAiEducationOutput["scenarioEvaluationContract"]
    >;
  }) =>
    trainingRatingRepository.updateOpenScenarioContract({
      db,
      ...payload,
    }),
  saveAttempt: (
    payload: Omit<
      Parameters<typeof trainingAttemptRepository.saveAttempt>[0],
      "db"
    >,
  ) =>
    trainingAttemptRepository.saveAttempt({
      db,
      ...payload,
    }),
  completeNode: (nodeId: string) =>
    trainingCurriculumRepository.completeNode({ db, nodeId }),
  touchSession: (sessionId: string) =>
    trainingOnboardingRepository.touchSession({ db, sessionId }),
  listMemories: async (userId: string) => {
    const result = await memoryRepository.listByUserId({
      db,
      userId,
    });

    return result.success ? result.data : [];
  },
  prepareDifficultyDirective: ({
    userId,
    nodeId,
    now,
  }: {
    userId: string;
    nodeId: string;
    now: Date;
  }) =>
    prepareScenarioDirective({
      db,
      userId,
      nodeId,
      now,
    }),
  applyManualDifficultyNudge: ({
    userId,
    nodeId,
    signal,
    now,
  }: {
    userId: string;
    nodeId: string;
    signal: ManualDifficultySignal;
    now: Date;
  }) =>
    trainingRatingRepository.applyManualDifficultyNudge({
      db,
      userId,
      nodeId,
      signal,
      initialRatingState: createInitialRatingState(),
      now,
    }),
  getOpenScenario: ({ userId, nodeId }: { userId: string; nodeId: string }) =>
    trainingRatingRepository.getOpenScenario({
      db,
      userId,
      nodeId,
    }),
  updateOpenScenarioItemRating: ({
    userId,
    nodeId,
    itemRating,
  }: {
    userId: string;
    nodeId: string;
    itemRating: number;
  }) =>
    trainingRatingRepository.updateOpenScenarioItemRating({
      db,
      userId,
      nodeId,
      itemRating,
    }),
  recordEvaluation: ({
    userId,
    nodeId,
    score,
    errorCodes,
    wasOverTime,
    occurredAt,
  }: {
    userId: string;
    nodeId: string;
    score: number | null | undefined;
    errorCodes: readonly string[];
    wasOverTime: boolean;
    occurredAt: Date;
  }) =>
    recordEvaluation({
      db,
      userId,
      nodeId,
      score,
      errorCodes,
      sidechatAskCount: 0,
      wasOverTime,
      occurredAt,
    }),
});

export const streamWorkspaceChat = async ({
  db,
  sessionId,
  userId,
  message,
  modelName,
  attemptTiming,
  action = "submit_answer",
  manualDifficultySignal = null,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  modelName?: string | null;
  attemptTiming?: AttemptTiming | null;
  action?: WorkspaceChatAction;
  manualDifficultySignal?: ManualDifficultySignal | null;
}) =>
  withAiModelPreference(modelName, () =>
    streamWorkspaceChatWithModelPreference({
      db,
      sessionId,
      userId,
      message,
      attemptTiming,
      action,
      manualDifficultySignal,
    }),
  );

const streamWorkspaceChatWithModelPreference = async ({
  db,
  sessionId,
  userId,
  message,
  attemptTiming,
  action,
  manualDifficultySignal,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  attemptTiming?: AttemptTiming | null;
  action: WorkspaceChatAction;
  manualDifficultySignal: ManualDifficultySignal | null;
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
              : action === "adjust_difficulty"
                ? "Recalibrating difficulty"
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

      const turnDeps = createWorkspaceTurnRepositoryDeps(db);
      const prepared = await prepareWorkspaceTurnPrompt({
        sessionId,
        userId,
        message,
        attemptTiming,
        action,
        manualDifficultySignal,
        deps: turnDeps,
      });
      const { runtime } = prepared;

      writeStatus(
        runtime.promptKind === "evaluate_feedback" ? "evaluating" : "thinking",
        prepared.turn.state.mode === "recall"
          ? action === "adjust_difficulty"
            ? "Rebuilding recall"
            : "Checking recall"
          : action === "next_scenario"
            ? "Preparing next scenario"
            : action === "adjust_difficulty"
              ? "Recalibrating difficulty"
              : runtime.promptKind === "evaluate_feedback"
                ? "Evaluating your answer"
                : "Preparing feedback",
      );
      const result = streamText({
        model: requireAiModelForPurpose(
          runtime.modelPurpose,
          "AI workspace turns",
        ),
        output: Output.object({
          schema: runtime.outputSchema as never,
          name:
            prepared.turn.state.mode === "recall"
              ? "workspace_recall_turn"
              : "workspace_education_turn",
        }),
        system: getWorkspaceAiSystemPrompt(runtime.promptKind),
        prompt: prepared.promptContext,
        tools: getSearchToolsForSelectedProvider(runtime.modelPurpose),
        stopWhen: stepCountIs(4),
      });

      for await (const partial of result.partialOutputStream) {
        const partialOutput = partial as { assistantMessage?: unknown };
        streamAssistantDelta(
          typeof partialOutput.assistantMessage === "string"
            ? partialOutput.assistantMessage
            : "",
        );
      }

      const rawOutput = await result.output;
      const output = parseWorkspaceTurnOutput({
        runtime,
        rawOutput,
      });
      streamAssistantDelta(output.assistantMessage);
      endAssistantText();
      writeStatus(
        "saving",
        action === "next_scenario"
          ? "Saving next scenario"
          : action === "adjust_difficulty"
            ? "Saving recalibrated scenario"
            : "Saving feedback",
      );
      await completeWorkspaceTurn({
        prepared,
        rawOutput: output,
        deps: turnDeps,
      });

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
