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
  WorkspaceAiEvaluationOutput,
  WorkspaceAiState,
} from "./domain/training/workspace-ai/types";
import { buildWorkspaceContextEnvelope } from "./domain/training/context-engine/build-context-envelope";
import { renderWorkspaceStageContextPrompt } from "./domain/training/context-engine/render-context-prompt";
import {
  compactTranscript,
  createSummarizer,
} from "./domain/training/engine/compaction";
import {
  getAiModelForPurpose,
  getSearchToolsForSelectedProvider,
  requireAiModelForPurpose,
  withAiModelPreference,
} from "./domain/training/engine/model-router";
import {
  clampClaimedItemRating,
  prepareScenarioDirective,
  recordEvaluation,
} from "./domain/training/orchestration/goldilocks";
import { buildWorkspaceIntroMessage } from "./domain/training/workflows/get-ai-workspace-workflow";
import {
  hasFailedEvaluationAttempt,
  normalizeEvaluationPlan,
  selectLatestEvaluationPlan,
} from "./domain/training/workspace-ai/evaluation-plan";
import { getWorkspaceAiSystemPrompt } from "./domain/training/workspace-ai/runtime";
import { selectWorkspaceTurnRuntime } from "./domain/training/workspace-ai/stage-runtime";
import {
  WorkspaceAiEducationOutputSchema,
  WorkspaceAiEvaluationOutputSchema,
  WorkspaceAiRecallOutputSchema,
} from "./domain/training/workspace-ai/types";
import {
  getWorkspaceMessageSlot,
  resolveWorkspaceTurn,
} from "./domain/training/workspace-ai/workspace-turn";
import {
  saveEducationTurnResult,
  saveNextScenarioPrompt,
  saveRecallTurnResult,
} from "./domain/training/workspace-ai/workspace-turn-persistence";
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
});

const SCENARIO_EDUCATION_STAGES = new Set<string>([
  "diagnostic_scenario",
  "guided_application",
  "performance_evaluation",
  "transfer_scenario",
]);

const isEvaluationOutput = (
  output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput,
): output is WorkspaceAiEvaluationOutput => "routingDecision" in output;

const shouldPrepareDifficultyDirective = ({
  state,
  action,
  runtimeContextMode,
}: {
  state: WorkspaceAiState;
  action: "submit_answer" | "next_scenario";
  runtimeContextMode: "teacher" | "evaluator" | "recall";
}) => {
  if (state.mode === "recall") return true;
  if (action === "next_scenario") return true;
  if (runtimeContextMode === "evaluator") return false;
  return state.educationStage
    ? SCENARIO_EDUCATION_STAGES.has(state.educationStage)
    : false;
};

export const streamWorkspaceChat = async ({
  db,
  sessionId,
  userId,
  message,
  modelName,
  attemptTiming,
  action = "submit_answer",
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  modelName?: string | null;
  attemptTiming?: AttemptTiming | null;
  action?: "submit_answer" | "next_scenario";
}) =>
  withAiModelPreference(modelName, () =>
    streamWorkspaceChatWithModelPreference({
      db,
      sessionId,
      userId,
      message,
      attemptTiming,
      action,
    }),
  );

const streamWorkspaceChatWithModelPreference = async ({
  db,
  sessionId,
  userId,
  message,
  attemptTiming,
  action,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  message: string;
  attemptTiming?: AttemptTiming | null;
  action: "submit_answer" | "next_scenario";
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
      const { plan, allResponses, state, node, unit, unitResponses } =
        await resolveWorkspaceTurn({ sessionId, deps: turnDeps });
      const slot = getWorkspaceMessageSlot(state.mode);
      if (action === "submit_answer") {
        const userMessage = await turnDeps.appendMessage({
          sessionId,
          role: "user",
          content: trimmedMessage,
          slot,
          unitId: unit.nodeId,
        });

        if (!userMessage) {
          throw new Error("User message could not be saved.");
        }
      }

      const messagesWithUser = await turnDeps.listMessages(sessionId, slot);

      // Compaction: keep the most recent units verbatim and fold older units
      // into an anchored rolling summary. The summarizer only runs when a new
      // unit has aged out (most turns reuse the stored summary, no LLM call).
      const storedSummary = await turnDeps.getWorkspaceSummary(sessionId, slot);
      const summarizeModel = getAiModelForPurpose("recall");
      const compaction = summarizeModel
        ? await compactTranscript({
            messages: messagesWithUser,
            previousSummary: storedSummary?.summary ?? null,
            previousCoverage: storedSummary?.coveredThroughUnitId ?? null,
            previousCoverageSequence:
              storedSummary?.coveredThroughSequence ?? null,
            summarize: createSummarizer(summarizeModel),
          })
        : null;
      if (compaction?.summaryChanged && compaction.summary) {
        await turnDeps.upsertWorkspaceSummary({
          sessionId,
          slot,
          summary: compaction.summary,
          coveredThroughUnitId: compaction.coverage,
          coveredThroughSequence: compaction.coverageSequence,
        });
      }
      const verbatimMessages = compaction?.messages ?? messagesWithUser;
      const progressSummary =
        compaction?.summary ?? storedSummary?.summary ?? null;

      const introMessage =
        state.mode === "recall" &&
        !messagesWithUser.some(
          (workspaceMessage) => workspaceMessage.role === "assistant",
        )
          ? buildWorkspaceIntroMessage({ plan, state })
          : null;
      const runtime = selectWorkspaceTurnRuntime(state);
      const activeEvaluationPlan = selectLatestEvaluationPlan(unitResponses);
      const shouldUseDifficultyDirective = shouldPrepareDifficultyDirective({
        state,
        action,
        runtimeContextMode: runtime.contextMode,
      });
      const [memoriesResult, difficultyDirectiveResult] = await Promise.all([
        memoryRepository.listByUserId({
          db,
          userId,
        }),
        shouldUseDifficultyDirective
          ? prepareScenarioDirective({
              db,
              userId,
              nodeId: unit.nodeId,
              now: new Date(),
            })
          : Promise.resolve(null),
      ]);
      const contextEnvelope = buildWorkspaceContextEnvelope({
        plan,
        node,
        unit,
        state,
        messages: verbatimMessages,
        introMessage,
        memories: memoriesResult.success ? memoriesResult.data : [],
        progressSummary,
        activeUnitResponses: unitResponses,
        allResponses,
        runtime,
        evaluationPlan: activeEvaluationPlan,
        attemptTiming,
        difficultyDirective: difficultyDirectiveResult
          ? {
              reason: difficultyDirectiveResult.directive.reason,
              promptBlock: difficultyDirectiveResult.promptBlock,
            }
          : null,
        ratingSnapshot: difficultyDirectiveResult?.ratingSnapshot ?? null,
      });
      const context = renderWorkspaceStageContextPrompt({
        envelope: contextEnvelope,
        runtime,
      });
      const promptContext =
        action === "next_scenario"
          ? `${context}\n\n## Turn instruction\nThe learner clicked Next scenario after reading evaluator feedback. Generate the next planned evaluation scenario only. Do not treat this as a learner answer. Do not re-grade the previous answer. Keep the current evaluation stage active unless this prompt is impossible.`
          : context;

      if (state.mode === "recall") {
        writeStatus("thinking", "Checking recall");
        const result = streamText({
          model: requireAiModelForPurpose(
            runtime.modelPurpose,
            "AI workspace turns",
          ),
          output: Output.object({
            schema: WorkspaceAiRecallOutputSchema,
            name: "workspace_recall_turn",
          }),
          system: getWorkspaceAiSystemPrompt(runtime.promptKind),
          prompt: promptContext,
          tools: getSearchToolsForSelectedProvider(runtime.modelPurpose),
          stopWhen: stepCountIs(4),
        });

        for await (const partial of result.partialOutputStream) {
          streamAssistantDelta(
            typeof partial.assistantMessage === "string"
              ? partial.assistantMessage
              : "",
          );
        }

        const output = await result.output;
        if (difficultyDirectiveResult) {
          await trainingRatingRepository.updateOpenScenarioItemRating({
            db,
            userId,
            nodeId: unit.nodeId,
            itemRating: clampClaimedItemRating({
              claimed: output.estimatedItemRating,
              target: difficultyDirectiveResult.directive.targetItemRating,
            }),
          });
        }
        streamAssistantDelta(output.assistantMessage);
        endAssistantText();
        writeStatus("saving", "Saving feedback");
        await saveRecallTurnResult({
          sessionId,
          userId,
          message: trimmedMessage,
          state,
          unit,
          plan,
          output,
          difficultyDirectiveReason:
            difficultyDirectiveResult?.directive.reason ?? null,
          deps: turnDeps,
        });
      } else {
        writeStatus(
          runtime.promptKind === "evaluate_feedback"
            ? "evaluating"
            : "thinking",
          action === "next_scenario"
            ? "Preparing next scenario"
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
            schema:
              runtime.promptKind === "evaluate_feedback"
                ? WorkspaceAiEvaluationOutputSchema
                : WorkspaceAiEducationOutputSchema,
            name: "workspace_education_turn",
          }),
          system: getWorkspaceAiSystemPrompt(runtime.promptKind),
          prompt: promptContext,
          tools: getSearchToolsForSelectedProvider(runtime.modelPurpose),
          stopWhen: stepCountIs(4),
        });

        for await (const partial of result.partialOutputStream) {
          streamAssistantDelta(
            typeof partial.assistantMessage === "string"
              ? partial.assistantMessage
              : "",
          );
        }

        const rawOutput = await result.output;
        const output: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput =
          runtime.promptKind === "evaluate_feedback"
            ? WorkspaceAiEvaluationOutputSchema.parse(rawOutput)
            : WorkspaceAiEducationOutputSchema.parse(rawOutput);
        const evaluationPlan = isEvaluationOutput(output)
          ? normalizeEvaluationPlan({
              plan: output.evaluationPlan,
              isRetryAfterFailure: hasFailedEvaluationAttempt(unitResponses),
            })
          : null;
        if (difficultyDirectiveResult) {
          await trainingRatingRepository.updateOpenScenarioItemRating({
            db,
            userId,
            nodeId: unit.nodeId,
            itemRating: clampClaimedItemRating({
              claimed: output.estimatedItemRating,
              target: difficultyDirectiveResult.directive.targetItemRating,
            }),
          });
        }
        streamAssistantDelta(output.assistantMessage);
        endAssistantText();
        writeStatus(
          "saving",
          action === "next_scenario"
            ? "Saving next scenario"
            : "Saving feedback",
        );
        if (action === "next_scenario") {
          await saveNextScenarioPrompt({
            sessionId,
            userId,
            unit,
            output,
            evaluationPlan,
            currentStage: state.educationStage,
            difficultyDirectiveReason:
              difficultyDirectiveResult?.directive.reason ?? null,
            deps: turnDeps,
          });
        } else {
          const priorEvaluationAttempts = unitResponses.filter(
            (response) =>
              response.phase === "ai_education" &&
              response.metadata?.promptKind === "evaluate_feedback" &&
              response.metadata.nextScenarioPrompt !== true,
          ).length;
          await saveEducationTurnResult({
            sessionId,
            userId,
            message: trimmedMessage,
            state,
            unit,
            plan,
            output,
            attemptTiming,
            evaluationPlan,
            priorEvaluationAttempts,
            difficultyDirectiveReason:
              difficultyDirectiveResult?.directive.reason ?? null,
            deps: turnDeps,
          });
          if (isEvaluationOutput(output)) {
            try {
              await recordEvaluation({
                db,
                userId,
                nodeId: unit.nodeId,
                score: output.score,
                errorCodes: output.failedDimensions,
                sidechatAskCount: 0,
                wasOverTime: attemptTiming?.wasOverTime ?? false,
                occurredAt: new Date(),
              });
            } catch (error) {
              console.error("Training rating evaluation recording failed", {
                userId,
                nodeId: unit.nodeId,
                error,
              });
            }
          }
        }
      }

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
