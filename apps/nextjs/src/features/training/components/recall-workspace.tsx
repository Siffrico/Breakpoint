"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";

import type { RouterOutputs } from "@acme/api";
import type { RecallChatMessage } from "@acme/api/recall-chat";
import type { RecallCommittedResponse } from "@acme/validators";
import { ChatComposerDock } from "@acme/ui/chat";
import { RecallCommittedResponseSchema } from "@acme/validators";

import type { UnitCoachController } from "./use-unit-coach-controller";
import { useTRPC } from "~/trpc/react";
import {
  educationUnitResponseDraftKey,
  useAutosavedResponseDraft,
} from "../hooks/use-autosaved-response-draft";
import { FocusComposer } from "./education-unit/focus-composer";
import {
  CHAT_COLUMN_CLASS,
  PromptTurn,
  SubmittedAnswerReceipt,
} from "./education-unit/pass-messages";
import { ScenarioPeek, useScenarioPeek } from "./education-unit/scenario-peek";
import { SelectionAskCoach } from "./education-unit/selection-ask-coach";
import { WorkspaceComposerInput } from "./education-unit/workspace-composer-input";

type RecallTask = NonNullable<RouterOutputs["recall"]["offer"]>;

interface VisibleExchange {
  answer: string;
  feedback: string;
  question: string | null;
}

const savedExchanges = (task: RecallTask): VisibleExchange[] => {
  const exchanges: VisibleExchange[] = [];
  if (task.firstRetrieval) {
    exchanges.push({
      answer: task.firstRetrieval.answer,
      feedback: [task.firstRetrieval.feedback, task.firstRetrieval.explanation]
        .filter(Boolean)
        .join("\n\n"),
      question: task.firstRetrieval.correctionQuestion,
    });
  }
  exchanges.push(
    ...task.correctionHistory.map((correction, index) => ({
      answer: correction.answer,
      feedback: correction.feedback,
      question:
        task.correctionHistory[index + 1]?.question ??
        (index === task.correctionHistory.length - 1
          ? task.currentQuestion
          : null),
    })),
  );
  return exchanges;
};

const getRecallResult = (
  message: RecallChatMessage,
): RecallCommittedResponse | null => {
  for (const part of message.parts) {
    if (part.type !== "data-recall-result") continue;
    const result = RecallCommittedResponseSchema.safeParse(part.data);
    if (result.success) return result.data;
  }
  return null;
};

const getAssistantText = (message: RecallChatMessage | undefined): string =>
  message?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("") ?? "";

export function RecallWorkspace({
  initialTask,
  sessionId,
  boundaryNodeId,
  canContinueLearning,
  onContinueLearning,
  onRunningChange,
  coach,
  onAdvanceReady,
}: {
  initialTask: RecallTask;
  sessionId: string;
  boundaryNodeId: string | null;
  canContinueLearning: boolean;
  onContinueLearning: () => void;
  onRunningChange: (running: boolean) => void;
  coach: UnitCoachController;
  onAdvanceReady: (advance: (() => void) | null) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const offerKey = trpc.recall.offer.queryKey({ sessionId, boundaryNodeId });
  const leaveRecall = async () => {
    queryClient.setQueryData(offerKey, null);
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: offerKey,
        refetchType: "none",
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.training.aiWorkspace.queryKey({ sessionId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.training.workspaceShell.queryKey({ sessionId }),
      }),
    ]);
    if (canContinueLearning) onContinueLearning();
  };
  const [previousTask, setPreviousTask] = useState(initialTask);
  const [task, setTask] = useState(initialTask);
  const { value: answer, setValue: setAnswer } = useAutosavedResponseDraft({
    enabled: true,
    storageKey: educationUnitResponseDraftKey({
      projectId: sessionId,
      unitId: task.id,
      promptId: task.interactionId ?? task.id,
    }),
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followsBottom = useRef(true);
  const startRequested = useRef(false);
  const [exchanges, setExchanges] = useState(() => savedExchanges(initialTask));
  const [retryRequest, setRetryRequest] = useState<{
    answer: string;
    requestId: string;
  } | null>(null);
  const pendingAnswerRef = useRef<{
    answer: string;
    interactionId: string;
  } | null>(null);

  if (previousTask !== initialTask) {
    setPreviousTask(initialTask);
    setTask(initialTask);
    setExchanges(savedExchanges(initialTask));
    if (
      task.interactionId !== initialTask.interactionId ||
      initialTask.pausedAt
    ) {
      setRetryRequest(null);
    }
  }
  const transport = useMemo(
    () =>
      new DefaultChatTransport<RecallChatMessage>({
        api: "/api/training/recall/chat",
      }),
    [],
  );
  const {
    messages: streamMessages,
    sendMessage,
    status,
    error,
    clearError,
    stop,
  } = useChat<RecallChatMessage>({
    id: `recall-${initialTask.id}`,
    transport,
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      if (isAbort || isDisconnect || isError) return;
      void queryClient.invalidateQueries({
        queryKey: offerKey,
        refetchType: "none",
      });
      const result = getRecallResult(message);
      const submittedAnswer = pendingAnswerRef.current;
      if (
        !result ||
        !submittedAnswer ||
        result.taskId !== task.id ||
        submittedAnswer.interactionId !== task.interactionId
      )
        return;
      pendingAnswerRef.current = null;
      setRetryRequest(null);
      setAnswer("");
      setExchanges((current) => [
        ...current,
        {
          answer: submittedAnswer.answer,
          feedback: result.feedback,
          question: result.question,
        },
      ]);
      setTask((current) => ({
        ...current,
        state: result.state,
        interactionId: result.interactionId,
        currentQuestion: result.question,
      }));
    },
  });

  const start = useMutation(
    trpc.recall.start.mutationOptions({
      onSuccess: (resumedTask) => {
        setTask(resumedTask);
        setExchanges(savedExchanges(resumedTask));
        queryClient.setQueryData(offerKey, resumedTask);
      },
    }),
  );
  const pause = useMutation(
    trpc.recall.pause.mutationOptions({
      onSuccess: () => void leaveRecall(),
    }),
  );
  useEffect(() => {
    onAdvanceReady(() => {
      if (task.state === "complete") void leaveRecall();
      else pause.mutate({ taskId: task.id });
    });
    return () => onAdvanceReady(null);
  });
  const pending = start.isPending || pause.isPending;
  const isSubmitting = status === "submitted" || status === "streaming";
  const streamingFeedback = isSubmitting
    ? getAssistantText(
        [...streamMessages]
          .reverse()
          .find(
            (message) =>
              message.role === "assistant" && !getRecallResult(message),
          ),
      )
    : "";
  const needsStart = task.state === "ready" || task.pausedAt != null;
  const { mutate: startTask } = start;
  useEffect(() => {
    if (!needsStart || startRequested.current) return;
    startRequested.current = true;
    startTask({ taskId: task.id, boundaryNodeId });
  }, [needsStart, startTask, task.id, boundaryNodeId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && followsBottom.current)
      element.scrollTop = element.scrollHeight;
  }, [exchanges, streamingFeedback, retryRequest]);

  const { isOpen: scenarioOpen, triggerProps } = useScenarioPeek({
    scenarioKey: task.challenge,
    autoPin: false,
  });

  const handleSubmit = (override?: string) => {
    const trimmed = (override ?? answer).trim();
    if (
      !trimmed ||
      !task.interactionId ||
      isSubmitting ||
      pending ||
      needsStart ||
      task.state === "complete"
    )
      return;
    setIsExpanded(false);
    const request =
      retryRequest?.answer === trimmed
        ? retryRequest
        : { answer: trimmed, requestId: crypto.randomUUID() };
    setRetryRequest(request);
    pendingAnswerRef.current = {
      answer: trimmed,
      interactionId: task.interactionId,
    };
    clearError();
    void sendMessage(
      { text: trimmed },
      {
        body: {
          taskId: task.id,
          interactionId: task.interactionId,
          requestId: request.requestId,
          answer: trimmed,
        },
      },
    ).catch(() => undefined);
  };

  useEffect(() => {
    onRunningChange(isSubmitting || pending);
    return () => onRunningChange(false);
  }, [isSubmitting, pending, onRunningChange]);

  const complete = task.state === "complete";
  const busy = isSubmitting || pending;
  const canCompose = !needsStart && !complete && !busy;
  const placeholder = complete
    ? "Press Enter to continue."
    : needsStart
      ? "Preparing your lesson…"
      : "Submit your answer.";
  const revise = (text: string) => {
    setAnswer(text);
    composerTextareaRef.current?.focus();
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            onScroll={() => {
              const element = scrollRef.current;
              if (element)
                followsBottom.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  160;
            }}
          >
            <div className="pt-5 pb-8">
              <PromptTurn prompt={task.challenge ?? ""} />
              {exchanges.map((exchange, index) => (
                <div key={index}>
                  <SubmittedAnswerReceipt
                    text={exchange.answer}
                    canRevise={canCompose}
                    onRevise={() => revise(exchange.answer)}
                    onAskCoach={() => coach.askAboutAnswer(exchange.answer)}
                  />
                  <PromptTurn
                    prompt={[exchange.feedback, exchange.question]
                      .filter(Boolean)
                      .join("\n\n")}
                  />
                </div>
              ))}
              {retryRequest ? (
                <SubmittedAnswerReceipt
                  text={retryRequest.answer}
                  pending={isSubmitting}
                  failed={!isSubmitting}
                  canRevise={canCompose}
                  onRevise={() => revise(retryRequest.answer)}
                  onRetry={() => handleSubmit(retryRequest.answer)}
                />
              ) : null}
              {isSubmitting ? (
                <PromptTurn
                  prompt={streamingFeedback}
                  statusLabel="Thinking…"
                  streaming
                />
              ) : null}
              {error || pause.error ? (
                <PromptTurn
                  prompt={error?.message ?? pause.error?.message ?? ""}
                  copyable={false}
                />
              ) : null}
              {start.error ? (
                <div className={CHAT_COLUMN_CLASS}>
                  <PromptTurn prompt={start.error.message} copyable={false} />
                  <button
                    type="button"
                    onClick={() =>
                      startTask({ taskId: task.id, boundaryNodeId })
                    }
                    className="text-foreground/70 hover:text-foreground mt-2 text-[13px] underline underline-offset-4"
                  >
                    Try again
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {task.challenge ? (
            <>
              <ScenarioPeek
                scenario={{
                  stateA: task.challenge,
                  stateB: "",
                  frictionNoise: null,
                }}
                open={scenarioOpen}
                columnClassName={CHAT_COLUMN_CLASS}
              />
              <button
                type="button"
                {...triggerProps}
                className="border-foreground/[0.12] bg-background/80 text-foreground/72 hover:border-foreground/25 hover:text-foreground/92 absolute top-3 right-4 z-30 touch-none rounded-full border px-2.5 py-0.5 text-[11px] leading-4 backdrop-blur-sm transition-colors duration-150 outline-none select-none focus-visible:ring-1 focus-visible:ring-current motion-reduce:transition-none sm:right-6"
              >
                Scenario
              </button>
            </>
          ) : null}
        </div>
        <ChatComposerDock className="shrink-0 pt-2 pb-2">
          <div className="bg-background shrink-0 font-sans">
            <WorkspaceComposerInput
              value={answer}
              onValueChange={setAnswer}
              onSubmit={() => handleSubmit()}
              onStop={() => void stop()}
              onExpand={() => setIsExpanded(true)}
              onRunCoachCommand={coach.runCommand}
              disabled={!canCompose && !complete}
              isRunning={busy}
              textareaRef={composerTextareaRef}
              placeholder={placeholder}
              awaitingPassAdvance={complete}
              onAdvancePass={() => void leaveRecall()}
            />
          </div>
        </ChatComposerDock>
        <FocusComposer
          open={isExpanded}
          initialMarkdown={answer}
          placeholder={placeholder}
          columnClassName={CHAT_COLUMN_CLASS}
          canSubmit={canCompose && Boolean(answer.trim())}
          isSubmitting={busy}
          awaitingUnitAdvance={complete}
          onAdvanceUnit={() => void leaveRecall()}
          onChange={setAnswer}
          onClose={() => setIsExpanded(false)}
          onSubmit={handleSubmit}
        />
      </div>
      <SelectionAskCoach onAsk={coach.askAboutSelection} />
    </>
  );
}
