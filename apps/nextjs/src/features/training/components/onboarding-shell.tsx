"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { ArrowClockwise, ArrowUp } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import {
  ChatComposer,
  ChatComposerDock,
  ChatMessage,
  ChatScrollToBottom,
  ChatStreamingCaret,
  ChatTranscript,
  ChatTranscriptContent,
  TypingIndicator,
} from "@acme/ui/chat";
import { toast } from "@acme/ui/toast";

import { previewOnboardingStates } from "~/features/training/lib/training-preview";
import { useTRPC } from "~/trpc/react";
import { AssistantRichText } from "./assistant-rich-text";

type OnboardingState =
  | RouterOutputs["training"]["startOnboarding"]
  | RouterOutputs["training"]["onboardingState"];

type CurriculumToolOutput =
  | {
      ok: true;
      planId: string;
      title: string;
      summary: string;
      unitCount: number;
      nextUnitId: string | null;
    }
  | { ok: false; reason: string };

const SUGGESTIONS = [
  "I want to master deep focus and ship world-class work",
  "I want to build wealth and financial independence",
];

const transcriptToMessages = (state: OnboardingState | null): UIMessage[] => {
  if (!state) return [];
  return state.transcript.map((message, index) => ({
    id: `seed-${state.sessionId}-${message.sequence ?? index}`,
    role: message.role,
    parts: [{ type: "text" as const, text: message.content }],
  }));
};

const extractText = (message: UIMessage): string =>
  message.parts
    .reduce<string[]>(
      (acc, part) => (part.type === "text" ? [...acc, part.text] : acc),
      [],
    )
    .join("\n")
    .trim();

export function OnboardingShell({
  preview = false,
  sessionId: sessionIdProp,
  initialState = null,
  onRunningChange,
  onTurnCountChange,
}: {
  preview?: boolean;
  embedded?: boolean;
  sessionId?: string;
  initialState?: OnboardingState | null;
  variant?: "default" | "landscape";
  onRunningChange?: (isRunning: boolean) => void;
  onTurnCountChange?: (count: number) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const startedRef = useRef(false);
  const [previewStep, setPreviewStep] = useState(0);
  const [previewState, setPreviewState] = useState<OnboardingState | null>(
    null,
  );

  const [sessionId, setSessionId] = useState<string | null>(
    sessionIdProp ?? initialState?.sessionId ?? null,
  );
  const [seedMessages] = useState<UIMessage[]>(() =>
    transcriptToMessages(initialState),
  );

  const startOnboarding = useMutation(
    trpc.training.startOnboarding.mutationOptions({
      onSuccess: (data) => {
        setSessionId(data.sessionId);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  useEffect(() => {
    if (preview || sessionId || startedRef.current) return;
    startedRef.current = true;
    startOnboarding.mutate();
  }, [preview, sessionId, startOnboarding]);

  const sessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/onboarding/chat",
        body: () => ({ sessionId: sessionIdRef.current }),
      }),
    [],
  );

  const initialUiMessages = useMemo<UIMessage[]>(() => {
    if (seedMessages.length > 0) return seedMessages;
    if (sessionId == null) {
      return [
        {
          id: "intro",
          role: "assistant",
          parts: [{ type: "text", text: "Who do you want to become?" }],
        },
      ];
    }
    return [];
  }, [seedMessages, sessionId]);

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
    stop,
    regenerate,
  } = useChat({
    transport,
    messages: initialUiMessages,
    onError: (err) => toast.error(err.message),
  });

  const seededFromStartRef = useRef(false);
  useEffect(() => {
    if (seededFromStartRef.current) return;
    if (!startOnboarding.data) return;
    seededFromStartRef.current = true;
    setMessages(transcriptToMessages(startOnboarding.data));
  }, [setMessages, startOnboarding.data]);

  const isStreaming = status === "submitted" || status === "streaming";
  const hasError = status === "error" || Boolean(error);

  const curriculum = useMemo<CurriculumToolOutput | null>(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (
          part.type === "tool-buildCurriculum" &&
          part.state === "output-available"
        ) {
          return part.output as CurriculumToolOutput;
        }
      }
    }
    return null;
  }, [messages]);
  const hasReadyCurriculum = curriculum?.ok === true;

  const openGeneratedWorkspace = useCallback(() => {
    if (preview || !sessionId) return;
    router.replace(`/workspace?session=${encodeURIComponent(sessionId)}`);
    router.refresh();
  }, [preview, router, sessionId]);

  useEffect(() => {
    onRunningChange?.(isStreaming || startOnboarding.isPending);
    return () => onRunningChange?.(false);
  }, [isStreaming, onRunningChange, startOnboarding.isPending]);

  useEffect(() => {
    if (!preview) return;
    const next =
      previewOnboardingStates[previewStep] ??
      previewOnboardingStates[0] ??
      null;
    setPreviewState(next);
  }, [preview, previewStep]);

  const [answer, setAnswer] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const renderMessages = preview
    ? transcriptToMessages(previewState)
    : messages;

  const userTurnCount = useMemo(
    () => renderMessages.filter((m) => m.role === "user").length,
    [renderMessages],
  );

  useEffect(() => {
    onTurnCountChange?.(userTurnCount);
  }, [onTurnCountChange, userTurnCount]);

  useEffect(() => {
    if (!sessionId || hasReadyCurriculum) return;
    composerRef.current?.focus();
  }, [hasReadyCurriculum, sessionId]);

  const submitText = useCallback(
    (text: string) => {
      if (preview) {
        const nextStep = Math.min(
          previewStep + 1,
          previewOnboardingStates.length - 1,
        );
        setAnswer("");
        setPreviewStep(nextStep);
        if (nextStep === previewOnboardingStates.length - 1) {
          window.setTimeout(() => router.push("/ui/transformation"), 700);
        }
        return;
      }

      const trimmed = text.trim();
      if (!trimmed || !sessionId || isStreaming || hasReadyCurriculum) return;

      setAnswer("");
      void sendMessage({ text: trimmed });
    },
    [
      hasReadyCurriculum,
      isStreaming,
      preview,
      previewStep,
      router,
      sendMessage,
      sessionId,
    ],
  );

  const handlePrimaryAction = () => {
    if (isStreaming) {
      stop();
      return;
    }
    if (hasError) {
      void regenerate();
      return;
    }
    submitText(answer);
  };

  const isStarted = renderMessages.some((message) => message.role === "user");
  const lastMessage = renderMessages[renderMessages.length - 1];
  const showTypingIndicator =
    isStreaming &&
    (!lastMessage ||
      lastMessage.role === "user" ||
      extractText(lastMessage).length === 0);

  const sessionReady = preview || Boolean(sessionId);
  const sendDisabled =
    isStreaming
      ? false
      : hasError
        ? false
        : !sessionReady || answer.trim().length === 0;
  const hint = isStreaming
    ? "Thinking…"
    : hasError
      ? "Last turn errored — retry?"
      : "⏎ send · ⇧⏎ newline";

  return (
    <main className="bg-background text-foreground relative flex h-full min-h-0 flex-1 flex-col">
      <ChatTranscript className="bg-background">
        <ChatTranscriptContent
          aria-live="polite"
          aria-relevant="additions text"
        >
          {!isStarted ? (
            <div className="mb-2">
              <h1 className="font-display text-foreground text-2xl tracking-[-0.03em] sm:text-3xl">
                Define your track
              </h1>
              <p className="text-foreground/55 mt-2 text-[14px] leading-7">
                Answer a few questions and we'll build a curriculum tuned to
                who you want to become.
              </p>
            </div>
          ) : null}

          {renderMessages.map((message, index) => {
            const text = extractText(message);
            if (!text) return null;
            const isLast = index === renderMessages.length - 1;
            const showCaret =
              isLast && message.role === "assistant" && isStreaming;
            return (
              <ChatMessage
                key={message.id}
                from={message.role}
                isStreaming={showCaret}
              >
                {message.role === "assistant" ? (
                  <>
                    <AssistantRichText content={text} />
                    {showCaret ? <ChatStreamingCaret /> : null}
                  </>
                ) : (
                  text
                )}
              </ChatMessage>
            );
          })}

          {showTypingIndicator ? (
            <ChatMessage from="assistant">
              <TypingIndicator />
            </ChatMessage>
          ) : null}

          {hasError && !isStreaming ? (
            <InlineErrorRow
              message={error?.message ?? "That turn errored."}
              onRetry={() => void regenerate()}
            />
          ) : null}

          {curriculum?.ok ? (
            <CurriculumReadyCard
              curriculum={curriculum}
              sessionId={sessionId}
              onOpen={openGeneratedWorkspace}
            />
          ) : null}
        </ChatTranscriptContent>

        <ChatScrollToBottom />

        {!hasReadyCurriculum ? (
          <ChatComposerDock>
            {!isStarted ? (
              <SuggestionChips
                suggestions={SUGGESTIONS}
                disabled={!preview && (!sessionId || isStreaming)}
                onSelect={(suggestion) => submitText(suggestion)}
              />
            ) : null}
            <ChatComposer
              value={answer}
              onValueChange={setAnswer}
              onSubmit={handlePrimaryAction}
              disabled={sendDisabled && !isStreaming && !hasError}
              textareaRef={composerRef}
              placeholder={
                !sessionReady
                  ? "Starting…"
                  : isStreaming
                    ? "Draft a reply while she's still thinking…"
                    : "Type your answer…"
              }
              hint={hint}
              rightSlot={
                <Button
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={sendDisabled}
                  variant={isStreaming ? "secondary" : "default"}
                  size="sm"
                  aria-label={
                    isStreaming
                      ? "Stop generating"
                      : hasError
                        ? "Retry last turn"
                        : "Send answer"
                  }
                >
                  {isStreaming ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-2 bg-current"
                      />
                      Stop
                    </>
                  ) : hasError ? (
                    <>
                      <ArrowClockwise size={12} weight="bold" />
                      Retry
                    </>
                  ) : (
                    <>
                      <ArrowUp size={12} weight="bold" />
                      Send
                    </>
                  )}
                </Button>
              }
            />
          </ChatComposerDock>
        ) : null}
      </ChatTranscript>
    </main>
  );
}

function InlineErrorRow({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="border-destructive/30 bg-destructive/[0.06] text-destructive flex w-full max-w-[68ch] items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5">
      <span className="text-[13px] leading-6">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="hover:bg-destructive/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium"
      >
        <ArrowClockwise size={11} weight="bold" />
        Retry
      </button>
    </div>
  );
}

function SuggestionChips({
  suggestions,
  disabled,
  onSelect,
}: {
  suggestions: readonly string[];
  disabled: boolean;
  onSelect: (suggestion: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(suggestion)}
          className="border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 min-w-[14rem] flex-1 rounded-xl border px-4 py-3 text-left text-[13px] leading-6 transition-colors"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function CurriculumReadyCard({
  curriculum,
  sessionId,
  onOpen,
}: {
  curriculum: Extract<CurriculumToolOutput, { ok: true }>;
  sessionId: string | null;
  onOpen: () => void;
}) {
  return (
    <div className="border-border bg-card mt-2 w-full max-w-[68ch] rounded-2xl border px-5 py-4 backdrop-blur">
      <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
        Curriculum ready
      </div>
      <div className="text-foreground mt-1 text-base font-medium">
        {curriculum.title}
      </div>
      <div className="text-muted-foreground mt-1 text-[13px] leading-6">
        {curriculum.unitCount}{" "}
        {curriculum.unitCount === 1 ? "unit" : "units"} · ready to start
      </div>
      <div className="mt-4">
        <Button
          type="button"
          onClick={onOpen}
          disabled={!sessionId}
          size="sm"
        >
          Open my workspace →
        </Button>
      </div>
    </div>
  );
}
