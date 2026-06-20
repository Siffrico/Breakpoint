import type { Result } from "../../../lib/result";
import type { Memory } from "../../memory/types";
import type {
  AttemptTiming,
  WorkspaceAiEducationOutput,
  WorkspaceAiEvaluationOutput,
  WorkspaceAiRecallOutput,
  WorkspaceAiTurnResult,
} from "../workspace-ai/types";
import type { WorkspaceTurnDependencies } from "../workspace-ai/workspace-turn";
import type { WorkspaceTurnPersistenceDependencies } from "../workspace-ai/workspace-turn-persistence";
import { err, ok } from "../../../lib/result";
import { buildWorkspaceContextEnvelope } from "../context-engine/build-context-envelope";
import { renderWorkspaceStageContextPrompt } from "../context-engine/render-context-prompt";
import { compactTranscript, createSummarizer } from "../engine/compaction";
import { getAiModelForPurpose } from "../engine/model-router";
import {
  hasFailedEvaluationAttempt,
  normalizeEvaluationPlan,
  selectLatestEvaluationPlan,
} from "../workspace-ai/evaluation-plan";
import { runWorkspaceAiPrompt } from "../workspace-ai/runtime";
import { selectWorkspaceTurnRuntime } from "../workspace-ai/stage-runtime";
import {
  getWorkspaceMessageSlot,
  resolveWorkspaceTurn,
} from "../workspace-ai/workspace-turn";
import {
  saveEducationTurnResult,
  saveRecallTurnResult,
} from "../workspace-ai/workspace-turn-persistence";
import { buildWorkspaceIntroMessage } from "./get-ai-workspace-workflow";

interface SubmitAiWorkspaceMessageDependencies
  extends WorkspaceTurnDependencies,
    WorkspaceTurnPersistenceDependencies {
  getWorkspaceSummary: (
    sessionId: string,
    slot: "education_unit" | "recall",
  ) => Promise<{
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  } | null>;
  upsertWorkspaceSummary: (input: {
    sessionId: string;
    slot: "education_unit" | "recall";
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  }) => Promise<void>;
  listMemories: (userId: string) => Promise<Memory[]>;
}

/**
 * Takes one user workspace message; produces the persisted AI response and next
 * workspace state; fails only when the session has no curriculum, no runnable
 * turn, invalid unit state, or the AI cannot produce schema-valid output.
 */
export const submitAiWorkspaceMessageWorkflow = async ({
  sessionId,
  userId,
  message,
  attemptTiming,
  deps,
}: {
  sessionId: string;
  userId: string;
  message: string;
  attemptTiming?: AttemptTiming | null;
  deps: SubmitAiWorkspaceMessageDependencies;
}): Promise<Result<WorkspaceAiTurnResult>> => {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < 2) {
    return err("Write a fuller message so the AI can respond usefully.");
  }

  let turn: Awaited<ReturnType<typeof resolveWorkspaceTurn>>;
  try {
    turn = await resolveWorkspaceTurn({ sessionId, deps });
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "Workspace turn failed.",
    );
  }

  const { plan, allResponses, state, node, unit, unitResponses } = turn;
  const memories = await deps.listMemories(userId);

  const userMessage = await deps.appendMessage({
    sessionId,
    role: "user",
    content: trimmedMessage,
    slot: getWorkspaceMessageSlot(state.mode),
    unitId: unit.nodeId,
  });
  if (!userMessage) {
    return err("User message could not be saved.");
  }

  const messagesWithUser = await deps.listMessages(
    sessionId,
    getWorkspaceMessageSlot(state.mode),
  );
  const slot = getWorkspaceMessageSlot(state.mode);
  const storedSummary = await deps.getWorkspaceSummary(sessionId, slot);
  const summarizeModel = getAiModelForPurpose("recall");
  const compaction = summarizeModel
    ? await compactTranscript({
        messages: messagesWithUser,
        previousSummary: storedSummary?.summary ?? null,
        previousCoverage: storedSummary?.coveredThroughUnitId ?? null,
        previousCoverageSequence: storedSummary?.coveredThroughSequence ?? null,
        summarize: createSummarizer(summarizeModel),
      })
    : null;
  if (compaction?.summaryChanged && compaction.summary) {
    await deps.upsertWorkspaceSummary({
      sessionId,
      slot,
      summary: compaction.summary,
      coveredThroughUnitId: compaction.coverage,
      coveredThroughSequence: compaction.coverageSequence,
    });
  }
  const verbatimMessages = compaction?.messages ?? messagesWithUser;
  const progressSummary = compaction?.summary ?? storedSummary?.summary ?? null;
  const introMessage =
    state.mode === "recall" &&
    !messagesWithUser.some((message) => message.role === "assistant")
      ? buildWorkspaceIntroMessage({
          plan,
          state,
        })
      : null;
  const runtime = selectWorkspaceTurnRuntime(state);
  const activeEvaluationPlan = selectLatestEvaluationPlan(unitResponses);
  const contextEnvelope = buildWorkspaceContextEnvelope({
    plan,
    node,
    unit,
    state,
    messages: verbatimMessages,
    introMessage,
    memories,
    progressSummary,
    activeUnitResponses: unitResponses,
    allResponses,
    runtime,
    evaluationPlan: activeEvaluationPlan,
    attemptTiming,
  });
  const context = renderWorkspaceStageContextPrompt({
    envelope: contextEnvelope,
    runtime,
  });

  if (state.mode === "recall") {
    const output = (await runWorkspaceAiPrompt({
      kind: runtime.promptKind,
      schema: runtime.outputSchema,
      errorMessage: "Failed to run recall.",
      context,
    })) as WorkspaceAiRecallOutput;

    return ok(
      await saveRecallTurnResult({
        sessionId,
        userId,
        message: trimmedMessage,
        state,
        unit,
        plan,
        deps,
        output,
      }),
    );
  }

  if (!state.educationStage) {
    return err("Education stage is missing.");
  }

  const output = (await runWorkspaceAiPrompt({
    kind: runtime.promptKind,
    schema: runtime.outputSchema,
    errorMessage: "Failed to run education unit.",
    context,
  })) as WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
  const evaluationPlan =
    "evaluationPlan" in output
      ? normalizeEvaluationPlan({
          plan: output.evaluationPlan,
          isRetryAfterFailure: hasFailedEvaluationAttempt(unitResponses),
        })
      : null;
  const priorEvaluationAttempts = unitResponses.filter(
    (response) =>
      response.phase === "ai_education" &&
      response.metadata?.promptKind === "evaluate_feedback" &&
      response.metadata.nextScenarioPrompt !== true,
  ).length;
  return ok(
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
      deps,
    }),
  );
};
