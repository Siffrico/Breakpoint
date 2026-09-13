import type { UIMessage } from "ai";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import type { db as databaseClient } from "@acme/db/client";
import type { RecallCommittedResponse } from "@acme/validators";

import { withAiModelPreference } from "./domain/training/engine/model-router";
import { submitRecallAnswerWorkflow } from "./domain/training/recall/workflows/submit-recall-answer";
import { createAssistantTextStreamer } from "./domain/training/workspace-ai/assistant-text-streamer";
import { runRecall } from "./router/run-effect";

type Database = typeof databaseClient;

export interface RecallChatDataParts extends Record<string, unknown> {
  "recall-result": RecallCommittedResponse;
}

export type RecallChatMessage = UIMessage<unknown, RecallChatDataParts>;

export const streamRecallChat = ({
  db,
  userId,
  taskId,
  interactionId,
  requestId,
  answer,
  modelName,
  signal,
}: {
  db: Database;
  userId: string;
  taskId: string;
  interactionId: string;
  requestId: string;
  answer: string;
  modelName?: string | null;
  signal?: AbortSignal;
}): Promise<Response> =>
  withAiModelPreference(modelName, () =>
    streamRecallChatWithModelPreference({
      db,
      userId,
      taskId,
      interactionId,
      requestId,
      answer,
      signal,
    }),
  );

const streamRecallChatWithModelPreference = ({
  db,
  userId,
  taskId,
  interactionId,
  requestId,
  answer,
  signal,
}: {
  db: Database;
  userId: string;
  taskId: string;
  interactionId: string;
  requestId: string;
  answer: string;
  signal?: AbortSignal;
}): Promise<Response> => {
    const stream = createUIMessageStream<RecallChatMessage>({
      onError: (error) =>
        error instanceof Error
          ? error.message
          : "Recall feedback could not be prepared.",
      execute: async ({ writer }) => {
        writer.write({ type: "start" });
        const assistantText = createAssistantTextStreamer({
          writer,
          partId: "recall-feedback",
        });
        const result = await runRecall(
          db,
          submitRecallAnswerWorkflow({
            userId,
            taskId,
            interactionId,
            requestId,
            answer,
            now: new Date(),
            onPartialFeedback: (content) => assistantText.pushPartial(content),
          }),
          { signal },
        );
        assistantText.finalize(
          [result.feedback, result.question]
            .filter((part): part is string => Boolean(part))
            .join("\n\n"),
        );
        assistantText.close();
        writer.write({
          type: "data-recall-result",
          id: "recall-result",
          data: result,
        });
        writer.write({ type: "finish", finishReason: "stop" });
      },
    });
    return Promise.resolve(createUIMessageStreamResponse({ stream }));
  };
