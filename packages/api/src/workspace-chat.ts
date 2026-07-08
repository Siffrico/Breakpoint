import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { TRPCError } from "@trpc/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";

import type {
  WorkspaceAiEducationStage,
  WorkspaceAiState,
} from "./domain/training/workspace-ai/types";
import { withAiModelPreference } from "./domain/training/engine/model-router";
import { WorkspaceUserError } from "./domain/training/errors";
import { createAssistantTextStreamer } from "./domain/training/workspace-ai/assistant-text-streamer";
import { resolveWorkspaceTurn } from "./domain/training/workspace-ai/workspace-turn";
import { runWorkspaceTurn } from "./domain/training/workspace-ai/workspace-turn-edge";
import { runEducationUnitTurn } from "./domain/training/workspace-ai/workspace-turn-orchestration";
import { trainingCurriculumRepository } from "./repositories/training-curriculum-repository";
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
  "workspace-turn-state": {
    state: WorkspaceAiState;
  };
}

type WorkspaceChatUIMessage = UIMessage<unknown, WorkspaceChatDataParts>;

const WORKSPACE_ASSISTANT_TEXT_PART_ID = "workspace-assistant";

/**
 * Status copy for an education turn, in two beats. The WORKING label is shown
 * while the model reads the submission and decides; the WRITING label replaces
 * it the instant the learner-facing reply starts streaming — so the status
 * narrates the turn (reading → writing) instead of holding one frozen line
 * through the whole wait. Both switches are exhaustive (no default) so a new
 * phase forces a copy decision. A recall interlude arrives as an education turn
 * with recallUnitId set, so it gets its own checkpoint framing.
 */
const getEducationWorkingLabel = (
  stage: WorkspaceAiEducationStage | null,
  isRecall: boolean,
): string => {
  if (isRecall) return "Designing a checkpoint";
  switch (stage) {
    case "orient":
      return "Designing your scenario";
    case "connect":
    case "solve":
      return "Reading your answer";
    case "teach":
      return "Preparing the explanation";
    case "mastered":
    case null:
      return "Reading your answer";
  }
};

const getEducationWritingLabel = (
  stage: WorkspaceAiEducationStage | null,
  isRecall: boolean,
): string => {
  if (isRecall) return "Writing the checkpoint";
  switch (stage) {
    case "orient":
      return "Writing the scenario";
    case "connect":
    case "solve":
      return "Writing feedback";
    case "teach":
      return "Explaining the concept";
    case "mastered":
    case null:
      return "Writing feedback";
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

  const plan = await trainingCurriculumRepository.getOwnedActivePlan({
    db,
    sessionId,
    userId,
  });
  if (!plan) {
    return new Response("Learning project not found.", { status: 404 });
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
        authorizedPlan: plan,
        deps: turnDeps,
      });

      const educationStage = turn.state.educationStage;
      const isRecallTurn = turn.state.recallUnitId !== null;
      writeStatus(
        "thinking",
        getEducationWorkingLabel(educationStage, isRecallTurn),
      );

      // Flip to the "writing" label the moment the reply starts streaming. The
      // partial callback fires only once the assistantMessage field is being
      // produced (see run-phase-agent), so this transition is truthful: the
      // model is done reading and is now writing.
      let startedWriting = false;
      const result = await runWorkspaceTurn(
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
            if (!startedWriting) {
              startedWriting = true;
              writeStatus(
                "thinking",
                getEducationWritingLabel(educationStage, isRecallTurn),
              );
            }
            assistantText.pushPartial(content);
          },
        }).pipe(Effect.provide(workspaceTurnRepoLayer(db))),
        { signal },
      );
      assistantText.close();
      writer.write({
        type: "data-workspace-turn-state",
        id: "workspace-turn-state",
        data: { state: result.state },
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
