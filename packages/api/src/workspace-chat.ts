import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { TRPCError } from "@trpc/server";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  Output,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";

import type { db as databaseClient } from "@acme/db/client";

import type { WorkspaceAiEducationStage } from "./domain/training/workspace-ai/types";
import type {
  ManualDifficultySignal,
  WorkspaceChatAction,
} from "./domain/training/workspace-ai/workspace-turn-orchestration";
import {
  getSearchToolsForSelectedProvider,
  requireAiModelForPurpose,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import { WorkspaceUserError } from "./domain/training/errors";
import { getWorkspaceAiSystemPrompt } from "./domain/training/workspace-ai/runtime";
import { resolveWorkspaceTurn } from "./domain/training/workspace-ai/workspace-turn";
import { runWorkspaceTurn } from "./domain/training/workspace-ai/workspace-turn-edge";
import {
  prepareRecallTurnPrompt,
  runEducationUnitTurn,
  saveRecallStepResult,
} from "./domain/training/workspace-ai/workspace-turn-orchestration";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";
import { createWorkspaceTurnRepositoryDeps } from "./repositories/workspace-turn-repository-deps";

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

/**
 * Education phase agents emit their complete reply as one block. This label is
 * what the learner sees while the model is working. The exhaustive switch (no
 * default) forces a copy decision whenever a phase is added or renamed.
 */
const getEducationTurnLabel = (
  stage: WorkspaceAiEducationStage | null,
): string => {
  switch (stage) {
    case "orient":
      return "Setting up this unit";
    case "connect":
      return "Checking your reasoning";
    case "solve":
      return "Reviewing your solution";
    case "teach":
      return "Preparing the next concept";
    case "mastered":
    case null:
      return "Preparing feedback";
  }
};

export const streamWorkspaceChat = async ({
  db,
  sessionId,
  userId,
  message,
  turnId = null,
  modelName,
  action = "submit_answer",
  manualDifficultySignal = null,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  turnId?: string | null;
  modelName?: string | null;
  action?: WorkspaceChatAction;
  manualDifficultySignal?: ManualDifficultySignal | null;
}): Promise<Response> =>
  withAiModelPreference(modelName, () =>
    streamWorkspaceChatWithModelPreference({
      db,
      sessionId,
      userId,
      message,
      turnId,
      action,
      manualDifficultySignal,
    }),
  );

const streamWorkspaceChatWithModelPreference = async ({
  db,
  sessionId,
  userId,
  message,
  turnId,
  action,
  manualDifficultySignal,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  turnId: string | null;
  action: WorkspaceChatAction;
  manualDifficultySignal: ManualDifficultySignal | null;
}) => {
  const trimmedMessage = message.trim();
  // This layer owns both the lease and the failure path. Lower layers must
  // never create a lease id that this catch boundary cannot release.
  const effectiveLeaseId = turnId ? randomUUID() : null;
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
    onError: (error) =>
      error instanceof WorkspaceUserError || error instanceof TRPCError
        ? error.message
        : "AI feedback could not be prepared.",
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
      const markTurnFailed = async (error: unknown) => {
        if (!turnId || !effectiveLeaseId || !turnDeps.markWorkspaceTurnFailed)
          return;
        if (
          error instanceof WorkspaceUserError ||
          (error instanceof TRPCError &&
            (error.code === "BAD_REQUEST" || error.code === "CONFLICT"))
        ) {
          return;
        }
        await turnDeps.markWorkspaceTurnFailed({
          sessionId,
          turnId,
          leaseId: effectiveLeaseId,
          reason: error instanceof Error ? error.message : "unknown error",
        });
      };

      try {
        const turn = await resolveWorkspaceTurn({
          sessionId,
          deps: turnDeps,
        });

        // Education phase agents emit one complete reply before persistence.
        // Recall still streams token-by-token below.
        if (turn.state.mode === "education_unit") {
          writeStatus(
            "thinking",
            getEducationTurnLabel(turn.state.educationStage),
          );
          await runWorkspaceTurn(
            runEducationUnitTurn({
              sessionId,
              userId,
              turnId,
              turnLeaseId: effectiveLeaseId,
              message,
              turn,
              deps: turnDeps,
              onAssistantMessage: (content) => {
                streamAssistantDelta(content);
                endAssistantText();
                // Education replies are emitted only after their transactional
                // message, FSM, and Goldilocks writes have committed.
              },
            }),
          );
          writeStatus("complete", "Complete");
          writer.write({ type: "finish", finishReason: "stop" });
          return;
        }

        const prepared = await prepareRecallTurnPrompt({
          sessionId,
          userId,
          turnId,
          turnLeaseId: effectiveLeaseId,
          message,
          action,
          manualDifficultySignal,
          turn,
          deps: turnDeps,
        });

        if (prepared.kind === "cached") {
          streamAssistantDelta(prepared.assistantMessage.content);
          endAssistantText();
          writeStatus("complete", "Complete");
          writer.write({ type: "finish", finishReason: "stop" });
          return;
        }

        const { runtime } = prepared;

        writeStatus(
          runtime.promptKind === "evaluate_feedback"
            ? "evaluating"
            : "thinking",
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
          // SDK-native server-side smoothing: pace the underlying text deltas
          // (the structured-output JSON) on word boundaries so partialOutputStream
          // grows in steady increments. Removes the need for client-side pacing.
          experimental_transform: smoothStream({
            delayInMs: 15,
            chunking: "word",
          }),
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
        const output = runtime.outputSchema.parse(rawOutput) as {
          assistantMessage: string;
        };
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
        await saveRecallStepResult({
          prepared,
          rawOutput: output,
          deps: turnDeps,
        });

        writeStatus("complete", "Complete");
        writer.write({ type: "finish", finishReason: "stop" });
      } catch (error) {
        await markTurnFailed(error);
        throw error;
      }
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
