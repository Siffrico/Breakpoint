"use client";

/* eslint-disable react-hooks/refs -- AI transport callbacks need access to the latest session id ref at send time. */
import type { UIMessage } from "ai";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { ArrowClockwise, ArrowUp, Plus } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";

import type { OnboardingChatUIMessage, ProjectBuildState } from "@acme/api/onboarding-chat";
import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import {
  ChatComposer,
  ChatComposerDock,
  ChatMessage,
  ChatScrollToBottom,
  ChatTranscript,
  ChatTranscriptContent,
  PacedAssistantText,
  TypingIndicator,
} from "@acme/ui/chat";
import { toast } from "@acme/ui/toast";

import { previewOnboardingStates } from "~/features/training/lib/training-preview";
import { useTRPC } from "~/trpc/react";
import { AssistantRichText } from "./assistant-rich-text";
import { CreateProjectConfirm } from "./onboarding/create-project-confirm";
import { ProjectBuildCard } from "./onboarding/project-build-card";

type OnboardingState = RouterOutputs["training"]["startOnboarding"];

const PREVIEW_RESPONSE_DELAY_MS = 450;

const transcriptToMessages = (
  state: OnboardingState | null,
): OnboardingChatUIMessage[] => {
  if (!state) return [];
  return state.transcript.map((message) => ({
    id: `seed-${state.sessionId}-${message.sequence}`,
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

const makePreviewMessage = (
  role: "user" | "assistant",
  text: string,
): OnboardingChatUIMessage => ({
  id: `preview-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  role,
  parts: [{ type: "text", text }],
});

const buildPreviewOnboardingReply = (answerText: string, turnCount: number) => {
  const normalized = answerText.trim();
  const nextQuestions = [
    "Where does that standard break down first when the week gets noisy?",
    "What recurring pressure makes the old pattern feel useful in the moment?",
    "What would a concrete training loop for that behavior look like this week?",
  ];
  const question = nextQuestions[turnCount % nextQuestions.length];

  return `That gives me a useful signal: you are not describing a vague aspiration, you are describing a repeatable operating standard.

I would encode your answer as:

1. **Target posture** — stay precise when the situation gets emotionally loud.
2. **Failure mode to train against** — letting urgency choose the next action before the hard constraint is named.
3. **Practice surface** — short, high-pressure decisions where you must state the tradeoff before acting.

You wrote: "${normalized.slice(0, 180)}${normalized.length > 180 ? "..." : ""}"

${question}`;
};

export function OnboardingShell({
  preview = false,
  embedded = false,
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
  const [previewMessages, setPreviewMessages] = useState<
    OnboardingChatUIMessage[]
  >(() => transcriptToMessages(previewOnboardingStates[0] ?? null));
  const [previewIsStreaming, setPreviewIsStreaming] = useState(false);
  const previewTimeoutRef = useRef<number | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(
    sessionIdProp ?? initialState?.sessionId ?? null,
  );
  const [seedMessages] = useState<OnboardingChatUIMessage[]>(() =>
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

  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current != null) {
        window.clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  const sessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/onboarding/chat",

        body: () => ({
          sessionId: sessionIdRef.current,
        }),
      }),
    [],
  );

  const initialUiMessages = useMemo<OnboardingChatUIMessage[]>(() => {
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
    addToolApprovalResponse,
  } = useChat<OnboardingChatUIMessage>({
    transport,
    messages: initialUiMessages,
    // Batch UI updates during streaming (SDK-native render throttling).
    experimental_throttle: 50,
    // Auto-resume the run the moment the learner approves "Create project".
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
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

  const sendStartRef = useRef<number | null>(null);

  // Latest streamed build snapshot, if any — drives both the inline build card
  // and the "project is ready" gating below.
  const projectBuild = useMemo<ProjectBuildState | null>(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role !== "assistant") continue;
      for (let j = message.parts.length - 1; j >= 0; j -= 1) {
        const part = message.parts[j];
        if (part?.type === "data-project-build") {
          return part.data as ProjectBuildState;
        }
      }
    }
    return null;
  }, [messages]);
  const projectReady = projectBuild?.phase === "complete";

  useEffect(() => {
    onRunningChange?.(isStreaming || startOnboarding.isPending);
    return () => onRunningChange?.(false);
  }, [isStreaming, onRunningChange, startOnboarding.isPending]);

  const [answer, setAnswer] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const renderMessages = preview ? previewMessages : messages;
  const effectiveIsStreaming = preview ? previewIsStreaming : isStreaming;

  const userTurnCount = useMemo(
    () => renderMessages.filter((m) => m.role === "user").length,
    [renderMessages],
  );

  useEffect(() => {
    onTurnCountChange?.(userTurnCount);
  }, [onTurnCountChange, userTurnCount]);

  // Refocus whenever the composer remounts: on session start and on the
  // hero → transcript switch after the first user turn.
  useEffect(() => {
    if (!sessionId || projectReady) return;
    composerRef.current?.focus();
  }, [projectReady, sessionId, userTurnCount]);

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (preview) {
        if (!trimmed || previewIsStreaming) return;
        setAnswer("");
        sendStartRef.current = Date.now();
        setPreviewIsStreaming(true);
        setPreviewMessages((current) => [
          ...current,
          makePreviewMessage("user", trimmed),
        ]);

        previewTimeoutRef.current = window.setTimeout(() => {
          const reply = buildPreviewOnboardingReply(trimmed, userTurnCount);
          const assistantMessage = makePreviewMessage("assistant", reply);
          setPreviewMessages((current) => [...current, assistantMessage]);
          setPreviewIsStreaming(false);
          sendStartRef.current = null;
          previewTimeoutRef.current = null;
        }, PREVIEW_RESPONSE_DELAY_MS);
        return;
      }

      if (!trimmed || !sessionId || isStreaming || projectReady) return;

      setAnswer("");
      sendStartRef.current = Date.now();
      void sendMessage({ text: trimmed });
    },
    [
      projectReady,
      isStreaming,
      preview,
      previewIsStreaming,
      sendMessage,
      sessionId,
      userTurnCount,
    ],
  );

  const handlePrimaryAction = () => {
    if (effectiveIsStreaming) {
      if (preview) {
        if (previewTimeoutRef.current != null) {
          window.clearTimeout(previewTimeoutRef.current);
          previewTimeoutRef.current = null;
        }
        setPreviewIsStreaming(false);
        return;
      }
      void stop();
      return;
    }
    if (hasError) {
      void regenerate();
      return;
    }
    submitText(answer);
  };

  const lastMessage = renderMessages[renderMessages.length - 1];
  const showTypingIndicator =
    effectiveIsStreaming &&
    (!lastMessage ||
      lastMessage.role === "user" ||
      extractText(lastMessage).length === 0);

  const sessionReady = preview || Boolean(sessionId);
  const sendDisabled = effectiveIsStreaming
    ? false
    : hasError
      ? false
      : !sessionReady || answer.trim().length === 0;

  // opencode-style new-session hero: wordmark + centered composer until the
  // first user turn lands, then the regular transcript + docked composer.
  const showHero = userTurnCount === 0 && !projectReady;

  const composer = (
    <ChatComposer
      value={answer}
      onValueChange={setAnswer}
      onSubmit={handlePrimaryAction}
      disabled={sendDisabled && !effectiveIsStreaming && !hasError}
      textareaRef={composerRef}
      placeholder={
        !sessionReady
          ? "Starting…"
          : showHero
            ? "Who do you want to become?"
            : effectiveIsStreaming
              ? "Draft a reply while she's still thinking…"
              : "Ask anything, / for commands, @ for context…"
      }
      leftSlot={
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Add context"
            className="flex size-7 items-center justify-center rounded-md text-[#8b8b8b] transition-colors outline-none hover:bg-white/[0.045] hover:text-[#d0d0d0] focus:outline-none focus-visible:outline-none"
          >
            <Plus size={16} />
          </button>
        </div>
      }
      rightSlot={
        <Button
          type="button"
          onClick={handlePrimaryAction}
          disabled={sendDisabled}
          variant="ghost"
          size="sm"
          className="size-8 rounded-[7px] border border-white/[0.055] bg-[linear-gradient(180deg,#303030_0%,#252525_48%,#1f1f1f_100%)] p-0 text-[#d7d7d7] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_6px_16px_rgba(0,0,0,0.34)] hover:bg-[linear-gradient(180deg,#3a3a3a_0%,#2d2d2d_48%,#242424_100%)] disabled:border-white/[0.035] disabled:bg-[linear-gradient(180deg,#292929_0%,#222222_48%,#1d1d1d_100%)] disabled:text-[#686868] disabled:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_5px_14px_rgba(0,0,0,0.26)]"
          aria-label={
            effectiveIsStreaming
              ? "Stop generating"
              : hasError
                ? "Retry last turn"
                : "Send answer"
          }
        >
          {effectiveIsStreaming ? (
            <span aria-hidden="true" className="size-2.5 bg-current" />
          ) : hasError ? (
            <ArrowClockwise size={14} weight="bold" />
          ) : (
            <ArrowUp size={14} weight="bold" />
          )}
        </Button>
      }
    />
  );

  if (showHero) {
    return (
      <main
        className={[
          "bp-workspace-theme bg-background text-foreground relative flex min-h-0 flex-1 flex-col",
          embedded ? "h-full" : "h-dvh",
        ].join(" ")}
      >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-[8vh]">
          <div className="animate-in fade-in slide-in-from-bottom-2 w-full max-w-[720px] duration-700">
            {/* Full-bleed SVG wordmark, same technique as opencode's
                WordmarkV2: w-full + h-auto so it always spans the composer
                column, with a soft vertical fade baked in via mask. */}
            <svg
              aria-hidden
              viewBox="0 0 720 150"
              className="fill-foreground/[0.08] mb-10 h-auto w-full select-none [mask-image:linear-gradient(to_bottom,black_30%,rgba(0,0,0,0.4)_100%)]"
            >
              <text
                x="360"
                y="118"
                textAnchor="middle"
                textLength="712"
                lengthAdjust="spacingAndGlyphs"
                fontSize="148"
                className="font-display font-semibold lowercase"
              >
                breakpoint
              </text>
            </svg>
            {composer}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={[
        "bp-workspace-theme bg-background text-foreground relative flex min-h-0 flex-1 flex-col",
        embedded ? "h-full" : "h-dvh",
      ].join(" ")}
    >
      <ChatTranscript className="bg-background">
        <ChatTranscriptContent
          aria-live="polite"
          aria-relevant="additions text"
        >
          {renderMessages.map((message, index) => {
            const text = extractText(message);
            const isLast = index === renderMessages.length - 1;
            const showCaret =
              isLast && message.role === "assistant" && effectiveIsStreaming;
            return (
              <Fragment key={message.id}>
                {text ? (
                  <ChatMessage from={message.role} isStreaming={showCaret}>
                    {message.role === "assistant" ? (
                      // Live turns are smoothed server-side by smoothStream, so
                      // we render them straight. Preview has no server, so it
                      // still needs client-side pacing to feel like a stream.
                      preview && showCaret ? (
                        <PacedAssistantText text={text} active={showCaret}>
                          {(visibleText) => (
                            <AssistantRichText content={visibleText} />
                          )}
                        </PacedAssistantText>
                      ) : (
                        <AssistantRichText content={text} />
                      )
                    ) : (
                      text
                    )}
                  </ChatMessage>
                ) : null}

                {/* Onboarding add-on parts: the approval button and the live
                    build card, rendered inline within the assistant turn. */}
                {message.role === "assistant"
                  ? message.parts.map((part, partIndex) => {
                      if (part.type === "data-project-build") {
                        const build = part.data as ProjectBuildState;
                        return (
                          <ProjectBuildCard
                            key={`${message.id}-build-${partIndex}`}
                            state={build}
                            preview={preview}
                            onStartLearning={() => {
                              if (preview || !build.sessionId) return;
                              router.replace(
                                `/workspace?session=${encodeURIComponent(build.sessionId)}`,
                              );
                              router.refresh();
                            }}
                            onSeeOverview={() => {
                              if (preview || !build.sessionId) return;
                              router.push(
                                `/overview?session=${encodeURIComponent(build.sessionId)}`,
                              );
                            }}
                            onRetry={() => void regenerate()}
                          />
                        );
                      }
                      if ((part.type as string) === "tool-createProject") {
                        return (
                          <CreateProjectConfirm
                            key={`${message.id}-confirm-${partIndex}`}
                            part={part}
                            busy={isStreaming}
                            onApprove={(approvalId) =>
                              void addToolApprovalResponse({
                                id: approvalId,
                                approved: true,
                              })
                            }
                            onDeny={(approvalId) =>
                              void addToolApprovalResponse({
                                id: approvalId,
                                approved: false,
                              })
                            }
                          />
                        );
                      }
                      return null;
                    })
                  : null}
              </Fragment>
            );
          })}

          {showTypingIndicator ? (
            <ChatMessage from="assistant">
              <TypingIndicator />
            </ChatMessage>
          ) : null}

          {hasError && !effectiveIsStreaming ? (
            <InlineErrorRow
              message={error?.message ?? "That turn errored."}
              onRetry={() => void regenerate()}
            />
          ) : null}

        </ChatTranscriptContent>

        <ChatScrollToBottom />

        {!projectReady ? (
          <ChatComposerDock>{composer}</ChatComposerDock>
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
