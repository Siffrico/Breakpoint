import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";

import type { db as databaseClient } from "@acme/db/client";
import { and, eq } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingUnitContent,
  TrainingUnitRun,
} from "@acme/db/schema";

import {
  getAiModelForPurpose,
  getMissingAiKeyMessage,
  getSearchToolsForSelectedProvider,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import { buildMissionContext } from "./domain/training/missions/context";
import { createMissionCreatorTools } from "./domain/training/missions/mission-creator-agent";
import { MISSION_CREATOR_PROMPT } from "./domain/training/missions/mission-creator-prompt";
import { missionRepository } from "./repositories/mission-repository";

type Database = typeof databaseClient;
export type MissionChatUIMessage = UIMessage;

/** Streams one authorized mission consultation; durable transcript persistence is post-response. */
export const streamMissionChat = async ({
  db,
  userId,
  unitRunId,
  messages,
  modelName,
  scheduleBackgroundTask,
}: {
  db: Database;
  userId: string;
  unitRunId: string;
  messages: UIMessage[];
  modelName?: string | null;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}): Promise<Response> =>
  withAiModelPreference(modelName, async () => {
    const run = await db.query.TrainingUnitRun.findFirst({
      where: and(
        eq(TrainingUnitRun.id, unitRunId),
        eq(TrainingUnitRun.userId, userId),
      ),
    });
    if (!run) return new Response("Mission unit not found.", { status: 404 });
    const unit = await db.query.TrainingUnitContent.findFirst({
      where: eq(TrainingUnitContent.id, run.unitContentId),
    });
    const node = unit
      ? await db.query.TrainingCurriculumNode.findFirst({
          where: eq(TrainingCurriculumNode.id, unit.nodeId),
        })
      : null;
    const plan = node
      ? await db.query.TrainingCurriculumPlan.findFirst({
          where: eq(TrainingCurriculumPlan.id, node.planId),
        })
      : null;
    if (!unit || !node || !plan)
      return new Response("Mission context is unavailable.", { status: 404 });
    const model = getAiModelForPurpose("mission");
    if (!model)
      return new Response(getMissingAiKeyMessage("mission chat"), {
        status: 500,
      });
    const context = buildMissionContext({
      goal: plan.targetIdentity,
      unitTitle: unit.title,
      unitGoal: node.summary,
      concepts: unit.scenarioFocusAreas,
    });
    const modelMessages = await convertToModelMessages(messages, {
      ignoreIncompleteToolCalls: true,
    });
    const stream = createUIMessageStream<MissionChatUIMessage>({
      onError: () => "The mission guide hit an error. Try again.",
      execute: ({ writer }) => {
        const result = streamText({
          model,
          system: `${MISSION_CREATOR_PROMPT}\n\n${context}`,
          messages: modelMessages,
          tools: {
            ...getSearchToolsForSelectedProvider("mission"),
            ...createMissionCreatorTools({
              confirmPlan: async ({ spec, plan }) => {
                await missionRepository.confirmPlan({
                  db,
                  userId,
                  unitRunId,
                  spec,
                  plan,
                });
              },
            getMission: async () =>
              (await missionRepository.getByUnitRun({ db, userId, unitRunId })) ??
              null,
              startMission: async () => {
                await missionRepository.start({ db, userId, unitRunId });
              },
              completeMission: async ({ proof, debrief }) => {
                await missionRepository.saveProofAndComplete({
                  db,
                  userId,
                  unitRunId,
                  proof,
                  debrief,
                });
              },
            }),
          },
          experimental_transform: smoothStream({
            delayInMs: 15,
            chunking: "word",
          }),
          stopWhen: stepCountIs(6),
          onFinish: ({ text }) => {
            const transcript = [
              ...messages,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                parts: [{ type: "text", text }],
              },
            ];
            const persist = async () => {
              await missionRepository.upsertDraft({
                db,
                userId,
                unitRunId,
                messages: transcript,
              });
            };
            if (scheduleBackgroundTask) scheduleBackgroundTask(persist);
            else void persist();
          },
        });
        writer.merge(result.toUIMessageStream());
      },
    });
    return createUIMessageStreamResponse({ stream });
  });
