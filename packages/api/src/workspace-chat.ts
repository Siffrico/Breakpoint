import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { TRPCError } from "@trpc/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";

import type { WorkspaceAiEducationStage } from "./domain/training/workspace-ai/types";
import { withAiModelPreference } from "./domain/training/engine/model-router";
import { createAssistantTextStreamer } from "./domain/training/workspace-ai/assistant-text-streamer";
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

interface WorkspaceChatDataParts extends Record<string, unknown> {
  "workspace-status": {
    status: WorkspaceStreamStatus;
    label: string;
  };
  /**
   * The committed assistant reply, sent only when it diverged from the
   * speculative streamed text (a restarted model attempt). The client renders
   * this instead of the message's text parts.
   */
  "workspace-final-text": {
    text: string;
  };
}

type WorkspaceChatUIMessage = UIMessage<unknown, WorkspaceChatDataParts>;

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
  // Only three labels, by what the learner is about to receive: a scenario,
  // a concept, or feedback on what they wrote. A recall interlude poses a
  // checkpoint scenario, so it reads as scenario creation.
  if (isRecall) return "Creating scenario";
  switch (stage) {
    case "orient":
      return "Creating scenario";
    case "connect":
      return "Giving feedback";
    case "solve":
      return "Giving feedback";
    case "teach":
      return "Explaining concept";
    case "mastered":
    case null:
      return "Giving feedback";
  }
};

export const streamWorkspaceChat = async ({
  db,
  sessionId,
  userId,
  message,
  turnId,
  modelName,
  signal,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  turnId: string;
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
  turnId: string;
  signal?: AbortSignal;
}) => {
  const trimmedMessage = message.trim();
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

      const writeStatus = (status: WorkspaceStreamStatus, label: string) => {
        writer.write({
          type: "data-workspace-status",
          id: "workspace-status",
          data: { status, label },
        });
      };
      // Partials are speculative — they stream before the turn's transactional
      // writes commit, so a failed commit can orphan text the learner already
      // read (the repair turn replays the committed reply). Only finalize()
      // carries durable truth and always reaches the client.
      const assistantText = createAssistantTextStreamer({
        writer,
        partId: WORKSPACE_ASSISTANT_TEXT_PART_ID,
      });

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
          turnId,
          turnLeaseId: effectiveLeaseId,
          message,
          turn,
          deps: turnDeps,
          onAssistantMessage: (content) => {
            assistantText.finalize(content);
          },
          onPartialAssistantMessage: (content) => {
            assistantText.pushPartial(content);
          },
        }).pipe(Effect.provide(workspaceTurnRepoLayer(db))),
        { signal },
      );
      assistantText.close();
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
