import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { TRPCError } from "@trpc/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { Effect } from "effect";

import type { db as databaseClient } from "@acme/db/client";
import type { WorkspaceTurnAction } from "@acme/validators";
import { sql } from "@acme/db";

import type { ScenarioBrief } from "./domain/training/education-unit/scenario-brief";
import type {
  WorkspaceAiEducationStage,
  WorkspaceAiState,
} from "./domain/training/workspace-ai/types";
import {
  createWorkspaceTurnPerformanceTimer,
  getErrorTag,
  withWorkspaceTurnPerformanceTimer,
} from "./domain/performance/workspace-turn-timing";
import { withAiModelPreference } from "./domain/training/engine/model-router";
import { WorkspaceUserError } from "./domain/training/errors";
import { createNextUnitNode } from "./domain/training/unit-creation/create-next-unit";
import { pregenerateNextUnit } from "./domain/training/unit-creation/pregenerate-next-unit";
import { createAssistantTextStreamer } from "./domain/training/workspace-ai/assistant-text-streamer";
import { resolveWorkspaceTurn } from "./domain/training/workspace-ai/workspace-turn";
import { translateWorkspaceTurnErrors } from "./domain/training/workspace-ai/workspace-turn-edge";
import { runEducationUnitTurn } from "./domain/training/workspace-ai/workspace-turn-orchestration";
import { queryWithClient } from "./effect/db";
import { recordWorkspaceTurnPerformanceBestEffort } from "./performance";
import { trainingCurriculumRepository } from "./repositories/training-curriculum-repository";
import { trainingUnitRunRepository } from "./repositories/training-unit-run-repository";
import {
  createUnitCreationRepositoryDeps,
  ensureOutcomeCurriculum,
  findNextPlannedOutcome,
  loadProgressionState,
} from "./repositories/unit-creation-repository-deps";
import {
  createWorkspaceTurnRepositoryDeps,
  workspaceTurnRepoLayer,
} from "./repositories/workspace-turn-repository-deps";
import { runEffect } from "./router/run-effect";

type Database = typeof databaseClient;

/**
 * The status beats a turn can emit, in order. Exported as the wire contract so
 * the client renders this union rather than a second copy of it.
 */
export type WorkspaceStreamStatus = "preparing" | "thinking" | "complete";

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
    passNumber: number;
    state: WorkspaceAiState;
    /**
     * The scenario for the pass this turn left on the board. Sent every turn
     * because the client's workspace read is bootstrap-frozen: without it, a
     * pass advance leaves the previous pass's brief on screen.
     */
    scenario: ScenarioBrief | null;
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
    case "learning":
      return "Understanding your reasoning";
    case "review":
      return "Stress-testing your answer";
    case "awaiting_next_pass":
      return "Opening the next challenge";
    case "complete":
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
    case "learning":
      return "Writing your next challenge";
    case "review":
      return "Writing the pressure test";
    case "awaiting_next_pass":
      return "Writing the next challenge";
    case "complete":
    case null:
      return "Writing feedback";
  }
};

/** The node row unit creation works with — pins pregen's generic parameter. */
type UnitCreationNode = Parameters<
  ReturnType<typeof createUnitCreationRepositoryDeps>["prepareUnitEffect"]
>[0];

export const streamWorkspaceChat = async ({
  db,
  sessionId,
  userId,
  action = "submit_answer",
  interactionId,
  message,
  turnId,
  modelName,
  requestStartedAt = Date.now(),
  signal,
  scheduleBackgroundTask,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  action?: WorkspaceTurnAction;
  interactionId: string;
  message: string;
  turnId: string;
  modelName?: string | null;
  requestStartedAt?: number;
  signal?: AbortSignal;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}): Promise<Response> =>
  withAiModelPreference(modelName, () =>
    streamWorkspaceChatWithModelPreference({
      db,
      sessionId,
      userId,
      action,
      interactionId,
      message,
      turnId,
      requestStartedAt,
      signal,
      scheduleBackgroundTask,
    }),
  );

const streamWorkspaceChatWithModelPreference = ({
  db,
  sessionId,
  userId,
  action,
  interactionId,
  message,
  turnId,
  requestStartedAt,
  signal,
  scheduleBackgroundTask,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  action: WorkspaceTurnAction;
  interactionId: string;
  message: string;
  turnId: string;
  requestStartedAt: number;
  signal?: AbortSignal;
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}) => {
  const trimmedMessage = message.trim();
  const effectiveLeaseId = randomUUID();
  if (action === "submit_answer" && trimmedMessage.length < 2) {
    return Promise.resolve(
      new Response("Write a fuller message so the AI can respond usefully.", {
        status: 400,
      }),
    );
  }

  const planPromise = trainingCurriculumRepository.getOwnedActivePlan({
    db,
    sessionId,
    userId,
  });

  const performanceTimer = createWorkspaceTurnPerformanceTimer({
    sessionId,
    turnId,
    action,
    requestStartedAt,
  });
  let performanceSaved = false;
  const savePerformance = (
    outcome: "success" | "error" | "aborted",
    error?: unknown,
  ) => {
    if (performanceSaved) return;
    performanceSaved = true;
    const metric = performanceTimer.finish({
      outcome,
      errorTag: error === undefined ? null : getErrorTag(error),
    });
    const saveMetric = () =>
      recordWorkspaceTurnPerformanceBestEffort(db, metric);
    if (!scheduleBackgroundTask) {
      void saveMetric();
      return;
    }
    try {
      scheduleBackgroundTask(saveMetric);
    } catch {
      void saveMetric();
    }
  };

  const stream = createUIMessageStream<WorkspaceChatUIMessage>({
    onError: (error) => {
      savePerformance(signal?.aborted ? "aborted" : "error", error);
      return error instanceof WorkspaceUserError || error instanceof TRPCError
        ? error.message
        : "AI feedback could not be prepared.";
    },
    execute: async ({ writer }) => {
      writer.write({ type: "start" });

      const writeStatus = (status: WorkspaceStreamStatus, label: string) => {
        writer.write({
          type: "data-workspace-status",
          id: "workspace-status",
          data: { status, label },
        });
      };
      writeStatus("preparing", "Preparing feedback");
      // Partials are speculative — they stream before the turn's transactional
      // writes commit, so a failed commit can orphan text the learner already
      // read (the repair turn replays the committed reply). Only finalize()
      // carries durable truth and always reaches the client.
      const assistantText = createAssistantTextStreamer({
        writer,
        partId: WORKSPACE_ASSISTANT_TEXT_PART_ID,
      });
      const plan = await planPromise;
      performanceTimer.markPlanLoaded();
      if (!plan) {
        throw new WorkspaceUserError("Learning project not found.");
      }

      const turnDeps = {
        ...createWorkspaceTurnRepositoryDeps(db, userId),
        scheduleBackgroundTask,
        pregenerateNextUnit: (input: {
          sessionId: string;
          userId: string;
          skillNodeId: string;
        }) =>
          Effect.runPromise(
            pregenerateNextUnit<UnitCreationNode>({
              ...input,
              deps: {
                ensureSkillKnowledge: (skillNodeId) =>
                  queryWithClient(db, "ensurePregeneratedSkillKnowledge", () =>
                    ensureOutcomeCurriculum({
                      db,
                      outcomeNodeId: skillNodeId,
                      targetIdentity: plan.targetIdentity,
                    }),
                  ),
                findNextPlannedCluster: (skillNodeId) =>
                  queryWithClient(db, "findNextPlannedOutcome", () =>
                    findNextPlannedOutcome({ db, outcomeNodeId: skillNodeId }),
                  ),
                withLock: ({ sessionId: lockedSessionId, key, run }) =>
                  queryWithClient(db, "pregenerateNextUnit", () =>
                    db.transaction(async (tx) => {
                      const transactionDb = tx as unknown as Database;
                      await transactionDb.execute(
                        sql`select pg_advisory_xact_lock(hashtext(${lockedSessionId}), hashtext(${key}))`,
                      );
                      return Effect.runPromise(
                        run({
                          isAwaitingUnitAdvance: ({ skillNodeId, sessionId }) =>
                            queryWithClient(
                              transactionDb,
                              "loadPregenerationAdvanceGate",
                              async () => {
                                const plan =
                                  await trainingCurriculumRepository.getActivePlan(
                                    { db: transactionDb, sessionId },
                                  );
                                const node =
                                  plan?.nodes.find(
                                    (candidate) =>
                                      candidate.kind === "unit" &&
                                      candidate.parentNodeId === skillNodeId &&
                                      candidate.status === "ready",
                                  ) ?? null;
                                const unit = node
                                  ? await trainingCurriculumRepository.getUnitByNodeId(
                                      { db: transactionDb, nodeId: node.id },
                                    )
                                  : null;
                                const unitRun = unit
                                  ? await trainingUnitRunRepository.getUnitRun({
                                      db: transactionDb,
                                      sessionId,
                                      unitContentId: unit.id,
                                    })
                                  : null;
                                return (
                                  unitRun?.kind === "education" &&
                                  unitRun.mode === "complete"
                                );
                              },
                            ),
                          getProgressionState: ({ skillNodeId, userId }) =>
                            queryWithClient(
                              transactionDb,
                              "loadPregenerationProgressionState",
                              () =>
                                loadProgressionState({
                                  db: transactionDb,
                                  skillNodeId,
                                  userId,
                                }),
                            ),
                          // Node row only — the transaction (and the advance
                          // lock it holds) must commit before any LLM call.
                          createUnitNode: ({
                            skillNodeId,
                            sessionId,
                            userId,
                            status,
                          }) =>
                            createNextUnitNode({
                              skillNodeId,
                              status,
                              deps: createUnitCreationRepositoryDeps({
                                db: transactionDb,
                                sessionId,
                                userId,
                              }),
                            }),
                        }),
                      );
                    }),
                  ),
                // Unlocked, non-transactional: the seed generation runs after
                // the planned node committed, so a Next Unit press never
                // queues behind the model call.
                prepareUnit: (node) =>
                  createUnitCreationRepositoryDeps({
                    db,
                    sessionId: input.sessionId,
                    userId: input.userId,
                  }).prepareUnitEffect(node),
              },
            }),
          ),
      };
      const turn = await resolveWorkspaceTurn({
        sessionId,
        authorizedPlan: plan,
        deps: turnDeps,
      });

      const educationStage = turn.state.educationStage;
      performanceTimer.markTurnReady(educationStage);
      const isRecallTurn = turn.state.recallUnitId !== null;
      writeStatus(
        "thinking",
        getEducationWorkingLabel(educationStage, isRecallTurn),
      );

      // Flip to the "writing" label the moment the reply starts streaming. The
      // partial callback fires only once the assistantMessage field is being
      // produced by either unit agent, so this transition is truthful: the
      // model is done reading and is now writing.
      let startedWriting = false;
      const result = await withWorkspaceTurnPerformanceTimer(
        performanceTimer,
        () =>
          runEffect(
            translateWorkspaceTurnErrors(
              runEducationUnitTurn({
                sessionId,
                userId,
                turnId,
                turnLeaseId: effectiveLeaseId,
                interactionId,
                action,
                message: trimmedMessage,
                turn,
                deps: turnDeps,
                onAssistantMessage: (content) => {
                  if (content.length > 0) performanceTimer.markFirstVisible();
                  assistantText.finalize(content);
                },
                onPartialAssistantMessage: (content) => {
                  if (content.length > 0) performanceTimer.markFirstVisible();
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
            ),
            { signal },
          ),
      );
      performanceTimer.markCommitted();
      assistantText.close();
      writer.write({
        type: "data-workspace-turn-state",
        id: "workspace-turn-state",
        data: {
          passNumber: result.passNumber,
          state: result.state,
          scenario: result.scenario,
        },
      });
      writeStatus("complete", "Complete");
      writer.write({ type: "finish", finishReason: "stop" });
      savePerformance("success");
    },
  });

  return Promise.resolve(
    createUIMessageStreamResponse({
      stream,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    }),
  );
};
