import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  hasToolCall,
  safeValidateUIMessages,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { Effect, Result } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import type { MissionProof } from "@acme/validators";

import {
  getSearchToolsForSelectedProvider,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import { createMissionCreatorTools } from "./domain/training/missions/mission-creator-agent";
import { MISSION_CREATOR_PROMPT } from "./domain/training/missions/mission-creator-prompt";
import { MissionInputError } from "./domain/training/missions/mission-errors";
import { confirmMissionPlanWorkflow } from "./domain/training/missions/workflows/confirm-mission-plan";
import { evaluateMissionAttemptWorkflow } from "./domain/training/missions/workflows/evaluate-mission-attempt";
import { openMissionConsultationWorkflow } from "./domain/training/missions/workflows/open-mission-consultation";
import { saveMissionTranscriptWorkflow } from "./domain/training/missions/workflows/save-mission-transcript";
import { missionErrorResponse, runMissionTool } from "./effect/mission-edge";
import { missionLayer } from "./effect/runtime";

type Database = typeof databaseClient;
export type MissionChatUIMessage = UIMessage;

/**
 * Streams one authorized mission consultation. This file owns transport only:
 * every rule it used to enforce inline now lives in a workflow, and every
 * failure — including the ones raised by tool callbacks — exits through the
 * shared mission failure table, so there are no literal status codes or
 * database calls here.
 */
export const streamMissionChat = async ({
  db,
  userId,
  unitRunId,
  messages,
  proof,
  modelName,
  scheduleBackgroundTask,
}: {
  db: Database;
  userId: string;
  unitRunId: string;
  messages: unknown[];
  proof?: MissionProof;
  modelName?: string | null;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}): Promise<Response> =>
  withAiModelPreference(modelName, async () => {
    const layer = missionLayer(db);

    // One joined read authorizes the run, refuses a closed mission, builds the
    // system context, and resolves the model.
    const opened = await Effect.runPromise(
      openMissionConsultationWorkflow({ userId, unitRunId }).pipe(
        Effect.provide(layer),
        Effect.result,
      ),
    );
    if (Result.isFailure(opened)) return missionErrorResponse(opened.failure);
    const consultation = opened.success;

    const validatedMessages =
      await safeValidateUIMessages<MissionChatUIMessage>({ messages });
    if (!validatedMessages.success)
      return missionErrorResponse(new MissionInputError({ field: "messages" }));

    const uiMessages = validatedMessages.data;
    const convertedMessages = await convertToModelMessages(uiMessages, {
      ignoreIncompleteToolCalls: true,
    });
    const modelMessages = proof
      ? [
          ...convertedMessages,
          {
            role: "user" as const,
            content: `The learner submitted this server-validated proof. Use its image URLs exactly if you complete the mission: ${JSON.stringify(proof)}`,
          },
        ]
      : convertedMessages;

    const stream = createUIMessageStream<MissionChatUIMessage>({
      onError: () => "The mission guide hit an error. Try again.",
      originalMessages: uiMessages,
      onFinish: ({ messages: persistedMessages }) => {
        const persist = () =>
          runMissionTool(
            saveMissionTranscriptWorkflow({
              userId,
              unitRunId,
              messages: persistedMessages,
            }).pipe(Effect.provide(layer)),
          );
        if (scheduleBackgroundTask) scheduleBackgroundTask(persist);
        else void persist();
      },
      execute: ({ writer }) => {
        const result = streamText({
          model: consultation.model,
          system: `${MISSION_CREATOR_PROMPT}\n\n${consultation.context}`,
          messages: modelMessages,
          tools: {
            ...getSearchToolsForSelectedProvider("mission"),
            ...createMissionCreatorTools({
              submittedProof: proof,
              confirmPlan: (input) =>
                runMissionTool(
                  confirmMissionPlanWorkflow({
                    userId,
                    unitRunId,
                    ...input,
                  }).pipe(Effect.provide(layer)),
                ),
              evaluateMission: (submittedProof) =>
                runMissionTool(
                  evaluateMissionAttemptWorkflow({
                    userId,
                    unitRunId,
                    proof: submittedProof,
                  }).pipe(Effect.provide(layer)),
                ),
            }),
          },
          experimental_transform: smoothStream({
            delayInMs: 15,
            chunking: "word",
          }),
          stopWhen: [
            stepCountIs(6),
            hasToolCall("ask"),
            hasToolCall("propose_missions"),
            hasToolCall("finalize_plan"),
            hasToolCall("edit_plan"),
            hasToolCall("complete_mission"),
          ],
        });
        writer.merge(result.toUIMessageStream());
      },
    });
    return createUIMessageStreamResponse({ stream });
  });
