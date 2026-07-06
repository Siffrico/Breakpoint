import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { TRPCError } from "@trpc/server";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";

import type { WorkspaceAiEducationStage } from "./domain/training/workspace-ai/types";
import { withAiModelPreference } from "./domain/training/engine/model-router";
import { WorkspaceUserError } from "./domain/training/errors";
import { resolveWorkspaceTurn } from "./domain/training/workspace-ai/workspace-turn";
import { runWorkspaceTurn } from "./domain/training/workspace-ai/workspace-turn-edge";
import { runEducationUnitTurn } from "./domain/training/workspace-ai/workspace-turn-orchestration";
import { trainingOnboardingRepository } from "./repositories/training-onboarding-repository";
import {
  createWorkspaceTurnRepositoryDeps,
  workspaceTurnRepoLayer,
} from "./repositories/workspace-turn-repository-deps";

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
 * A recall interlude arrives as a solve-phase education turn with
 * recallUnitId set, so it gets its own checkpoint framing.
 */
const getEducationTurnLabel = (
  stage: WorkspaceAiEducationStage | null,
  isRecall: boolean,
): string => {
  if (isRecall) return "Running a quick checkpoint";
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
  signal,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  turnId?: string | null;
  modelName?: string | null;
  signal?: AbortSignal;
}): Promise<Response> =>
  withAiModelPreference(modelName, () =>
    streamWorkspaceChatWithModelPreference({
      db,
      sessionId,
      userId,
      message,
      turnId,
      signal,
    }),
  );

const streamWorkspaceChatWithModelPreference = async ({
  db,
  sessionId,
  userId,
  message,
  turnId,
  signal,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  turnId: string | null;
  signal?: AbortSignal;
}) => {
  const trimmedMessage = message.trim();
  // Optionality ends at the transport boundary. Every turn gets a stable
  // idempotency key and a lease, including clients that omit a turn id.
  const effectiveTurnId = turnId ?? randomUUID();
  const effectiveLeaseId = randomUUID();
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

  const stream = createUIMessageStream<WorkspaceChatUIMessage>({
    onError: (error) =>
      error instanceof WorkspaceUserError || error instanceof TRPCError
        ? error.message
        : "AI feedback could not be prepared.",
    execute: async ({ writer }) => {
      writer.write({ type: "start" });

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
      writeStatus("preparing", "Preparing feedback");

      const turn = await resolveWorkspaceTurn({
        sessionId,
        deps: turnDeps,
      });

      writeStatus(
        "thinking",
        getEducationTurnLabel(
          turn.state.educationStage,
          turn.state.recallUnitId !== null,
        ),
      );
      await runWorkspaceTurn(
        runEducationUnitTurn({
          sessionId,
          userId,
          turnId: effectiveTurnId,
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
        }).pipe(Effect.provide(workspaceTurnRepoLayer(db))),
        { signal },
      );
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
