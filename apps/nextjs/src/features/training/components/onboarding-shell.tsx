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
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";

import type { RouterOutputs } from "@acme/api";
import type {
  OnboardingChatUIMessage,
  ProjectBuildState,
} from "@acme/api/onboarding-chat";
import type { StartingPointTier } from "@acme/validators";
import {
  ChatComposerDock,
  ChatMessage,
  ChatScrollToBottom,
  ChatTranscript,
  ChatTranscriptContent,
  ComposerSendButton,
  OnboardingComposer,
  PacedAssistantText,
  StatusSpinner,
  TextShimmer,
} from "@acme/ui/chat";
import { toast } from "@acme/ui/toast";

import {
  onboardingResponseDraftKey,
  shouldClearSubmittedDraft,
  useAutosavedResponseDraft,
} from "~/features/training/hooks/use-autosaved-response-draft";
import { previewOnboardingStates } from "~/features/training/lib/training-preview";
import { useTRPC } from "~/trpc/react";
import { AssistantRichText } from "./assistant-rich-text";
import { CreateProjectConfirm } from "./onboarding/create-project-confirm";
import { OnboardingUtilityActions } from "./onboarding/onboarding-utility-actions";
import { ProjectBuildScreen } from "./onboarding/project-build-screen";
import { selectProjectBuildPart } from "./onboarding/select-project-build-part";
import { StartingPointCheck } from "./onboarding/starting-point-check";

type OnboardingState = RouterOutputs["training"]["startOnboarding"];

const PREVIEW_RESPONSE_DELAY_MS = 450;

const transcriptToMessages = (
  state: OnboardingState | null,
): OnboardingChatUIMessage[] => {
  if (!state) return [];
  const messages: OnboardingChatUIMessage[] = state.transcript.map(
    (message) => ({
      id: `seed-${state.sessionId}-${message.sequence}`,
      role: message.role,
      parts: [{ type: "text" as const, text: message.content }],
    }),
  );

  if (state.pendingProjectProposal) {
    messages.push({
      id: `seed-${state.sessionId}-project-proposal`,
      role: "assistant",
      parts: [
        {
          type: "tool-createProject",
          toolCallId: `rehydrated-create-project-${state.sessionId}`,
          state: "approval-requested",
          input: state.pendingProjectProposal,
          approval: {
            id: `rehydrated-create-project-approval-${state.sessionId}`,
          },
        },
      ],
    } as OnboardingChatUIMessage);
  }

  if (state.projectBuild) {
    messages.push({
      id: `seed-${state.sessionId}-project-build`,
      role: "assistant",
      parts: [{ type: "data-project-build", data: state.projectBuild }],
    });
  }

  return messages;
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
  curriculumMode = "topic",
  showCurriculumControl = false,
  onRunningChange,
  onTurnCountChange,
}: {
  preview?: boolean;
  embedded?: boolean;
  sessionId?: string;
  initialState?: OnboardingState | null;
  /**
   * Which curriculum shape a newly started session builds toward. Only read
   * when this mount actually starts a session.
   */
  curriculumMode?: "ability" | "topic";
  showCurriculumControl?: boolean;
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
  const pendingDraftRef = useRef<{
    key: string | null;
    text: string;
  } | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(
    sessionIdProp ?? initialState?.sessionId ?? null,
  );
  const [selectedCurriculumMode, setSelectedCurriculumMode] =
    useState(curriculumMode);
  const [seedMessages] = useState<OnboardingChatUIMessage[]>(() =>
    transcriptToMessages(initialState),
  );

  const startOnboarding = useMutation(
    trpc.training.startOnboarding.mutationOptions({
      onSuccess: (data, variables) => {
        setSessionId(data.sessionId);
        setSelectedCurriculumMode(variables?.curriculumMode ?? "topic");
        const modeParam =
          variables?.curriculumMode === "topic" ? "&curriculum=topic" : "";
        router.replace(
          `/onboarding?session=${encodeURIComponent(data.sessionId)}${modeParam}`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const continueLearning = useMutation(
    trpc.training.continueLearningProject.mutationOptions({
      onSuccess: (destination) => router.replace(destination.href),
      onError: (error) => toast.error(error.message),
    }),
  );
  const setStartingPoint = useMutation(
    trpc.training.setStartingPoint.mutationOptions({
      // Optimistic: the confirm card already updated its own local tier; a
      // failure just surfaces a toast and the next build read falls back.
      onError: (error) => toast.error(error.message),
    }),
  );
  useEffect(() => {
    if (preview || sessionId || startedRef.current) return;
    startedRef.current = true;
    startOnboarding.mutate({ curriculumMode: selectedCurriculumMode });
  }, [preview, selectedCurriculumMode, sessionId, startOnboarding]);

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
        prepareSendMessagesRequest: ({ body, messages }) => ({
          body: {
            ...body,
            messages: messages.slice(-1),
          },
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
          parts: [
            {
              type: "text",
              text: "What's something you've seen someone build or do that made you think: I want to be able to do that?",
            },
          ],
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
    addToolResult,
  } = useChat<OnboardingChatUIMessage>({
    transport,
    messages: initialUiMessages,
    // Batch UI updates during streaming (SDK-native render throttling).
    experimental_throttle: 50,
    // Auto-resume the run when EITHER the learner approves "Create project"
    // (approval response) OR taps a starting-point option (tool result).
    sendAutomaticallyWhen: (options) =>
      lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
      lastAssistantMessageIsCompleteWithToolCalls(options),
    onFinish: (finishState) => {
      if (!shouldClearSubmittedDraft(finishState)) return;
      clearSubmittedDraft(pendingDraftRef.current?.key ?? null);
      pendingDraftRef.current = null;
    },
    onError: (err) => {
      const pendingDraft = pendingDraftRef.current;
      if (pendingDraft) {
        restoreSubmittedDraft(pendingDraft.key, pendingDraft.text);
      }
      pendingDraftRef.current = null;
      toast.error(err.message);
    },
  });

  const seededSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!startOnboarding.data) return;
    if (seededSessionIdRef.current === startOnboarding.data.sessionId) return;
    seededSessionIdRef.current = startOnboarding.data.sessionId;
    setMessages(transcriptToMessages(startOnboarding.data));
  }, [setMessages, startOnboarding.data]);

  // A reload that raced a dying stream can leave the persisted transcript
  // ending on the learner's message with no reply. Answer it once instead of
  // stranding them in a dangling turn; the server dedupes the re-sent message
  // so no duplicate row is appended. Never fires during normal sends (status
  // is submitted/streaming) or after errors (status is error).
  const recoveredDanglingTurnRef = useRef(false);
  useEffect(() => {
    if (preview || recoveredDanglingTurnRef.current) return;
    if (!sessionId || status !== "ready") return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== "user") return;
    recoveredDanglingTurnRef.current = true;
    void regenerate();
  }, [preview, sessionId, status, messages, regenerate]);

  const isStreaming = status === "submitted" || status === "streaming";
  const hasError = status === "error" || Boolean(error);

  const sendStartRef = useRef<number | null>(null);

  // A completed snapshot is monotonic: stale live progress cannot supersede it
  // while useChat reconciles streamed and rehydrated messages.
  const latestProjectBuildPart = useMemo(
    () => selectProjectBuildPart(messages),
    [messages],
  );
  const streamedBuild = latestProjectBuildPart?.state ?? null;

  // The SSE stream is a live view of the build; the checkpoint row is the
  // record of it. While the stream is connected it is authoritative and we do
  // not poll at all — the poll only takes over once the stream is gone (tab
  // reopened, invocation killed, or the build yielded). Because the two are
  // never live at the same time, there is nothing to order and no revision
  // number to carry.
  const buildUnfinished =
    Boolean(streamedBuild) &&
    streamedBuild?.phase !== "complete" &&
    streamedBuild?.phase !== "error";
  const buildRun = useQuery({
    ...trpc.training.getBuildRun.queryOptions({ sessionId: sessionId ?? "" }),
    enabled: !preview && Boolean(sessionId) && buildUnfinished && !isStreaming,
    refetchInterval: 2_000,
  });
  const projectBuild = (!isStreaming ? buildRun.data : null) ?? streamedBuild;
  const projectReady = projectBuild?.phase === "complete";

  // A yielded build checkpointed itself and released its lease; picking it up is
  // the same deterministic resume the retry button fires. The ref keys on the
  // round so each yield resumes exactly once, however often this re-renders.
  const resumedRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (preview || !sessionId || isStreaming) return;
    if (projectBuild?.phase !== "needs_resume") return;
    const round = projectBuild.resumeRounds ?? 0;
    if (resumedRoundRef.current === round) return;
    resumedRoundRef.current = round;
    void regenerate({ body: { resumeBuild: true } });
  }, [preview, sessionId, isStreaming, projectBuild, regenerate]);

  useEffect(() => {
    onRunningChange?.(isStreaming || startOnboarding.isPending);
    return () => onRunningChange?.(false);
  }, [isStreaming, onRunningChange, startOnboarding.isPending]);

  const composerRef = useRef<HTMLTextAreaElement>(null);

  const renderMessages = preview ? previewMessages : messages;
  const effectiveIsStreaming = preview ? previewIsStreaming : isStreaming;
  const promptId = useMemo(() => {
    const assistantPromptCount = renderMessages.filter(
      (message) =>
        message.role === "assistant" && extractText(message).length > 0,
    ).length;
    return `assistant:${Math.max(assistantPromptCount - 1, 0)}`;
  }, [renderMessages]);
  const responseDraftKey =
    !preview && sessionId
      ? onboardingResponseDraftKey(sessionId, promptId)
      : null;
  const {
    value: answer,
    setValue: setAnswer,
    markSubmitted,
    restoreSubmitted: restoreSubmittedDraft,
    clearSubmitted: clearSubmittedDraft,
  } = useAutosavedResponseDraft({
    enabled: !preview,
    storageKey: responseDraftKey,
  });

  const userTurnCount = useMemo(
    () => renderMessages.filter((m) => m.role === "user").length,
    [renderMessages],
  );

  // Index of the newest user message. An unanswered starting-point card that
  // sits before it was answered in prose instead of tapped — hide it so a
  // stray late tap can't persist a tier and fire an extra model turn.
  const lastUserMessageIndex = useMemo(() => {
    for (let i = renderMessages.length - 1; i >= 0; i -= 1) {
      if (renderMessages[i]?.role === "user") return i;
    }
    return -1;
  }, [renderMessages]);

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

      pendingDraftRef.current = {
        key: markSubmitted(),
        text: trimmed,
      };
      sendStartRef.current = Date.now();
      void sendMessage({ text: trimmed });
    },
    [
      projectReady,
      isStreaming,
      preview,
      previewIsStreaming,
      sendMessage,
      setAnswer,
      sessionId,
      markSubmitted,
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
  const manualSetupHref = preview
    ? "/ui/profile"
    : sessionId
      ? `/settings/topics?session=${encodeURIComponent(sessionId)}`
      : "/settings/topics";

  const manualSetupAction = !embedded ? (
    <OnboardingUtilityActions
      activeSessionId={sessionId}
      manualSetupHref={manualSetupHref}
      curriculumMode={selectedCurriculumMode}
      showCurriculumControl={showCurriculumControl}
      curriculumChangeDisabled={isStreaming || startOnboarding.isPending}
      onCurriculumModeChange={(mode) => {
        if (mode === selectedCurriculumMode) return;
        setSelectedCurriculumMode(mode);
        startOnboarding.mutate({ curriculumMode: mode });
      }}
    />
  ) : null;

  const composer = (
    <OnboardingComposer
      value={answer}
      onValueChange={setAnswer}
      onSubmit={handlePrimaryAction}
      disabled={sendDisabled && !effectiveIsStreaming && !hasError}
      textareaRef={composerRef}
      placeholder={
        !sessionReady
          ? "Starting…"
          : showHero
            ? "Something you've seen built that you want to be able to build…"
            : effectiveIsStreaming
              ? "Draft a reply while your onboarder is typing…"
              : "Ask anything, / for commands, @ for context…"
      }
      leftSlot={
        <button
          type="button"
          aria-label="Add context"
          className="flex size-9 items-center justify-center rounded-full text-[#8b8b8b] transition-colors outline-none hover:bg-white/[0.045] hover:text-[#d0d0d0] focus:outline-none focus-visible:outline-none"
        >
          <Plus size={17} />
        </button>
      }
      rightSlot={
        <ComposerSendButton
          rounding="circular"
          className="size-9"
          onSubmit={handlePrimaryAction}
          disabled={sendDisabled}
          sendLabel={
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
        </ComposerSendButton>
      }
    />
  );

  if (showHero) {
    // Hero composer: the same single-row pill as the docked composer, just
    // roomier and lifted off the background. Onboarding asks for one short
    // answer at a time, so the pill never implies a drafting surface.
    const heroComposer = (
      <OnboardingComposer
        value={answer}
        onValueChange={setAnswer}
        onSubmit={handlePrimaryAction}
        disabled={sendDisabled && !effectiveIsStreaming && !hasError}
        textareaRef={composerRef}
        // Concentric geometry: 38px buttons + 10px padding + 1px border = 60px
        // tall, so a 30px radius makes the end caps exact semicircles sharing a
        // centre with the buttons — a uniform 11px gap around each button arc.
        className="border-white/[0.105] bg-[#141414] p-2.5"
        style={{
          borderRadius: 30,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.035), 0 18px 40px rgba(0,0,0,0.38), 0 3px 8px rgba(0,0,0,0.35)",
        }}
        placeholder={!sessionReady ? "Starting…" : "i want the skills of:"}
        leftSlot={
          <button
            type="button"
            aria-label="Add context"
            className="flex size-9.5 items-center justify-center rounded-full text-[#9a9a9a] transition-colors outline-none hover:bg-white/[0.045] hover:text-[#cfcfcf]"
          >
            <Plus size={17} />
          </button>
        }
        rightSlot={
          <ComposerSendButton
            rounding="circular"
            className="size-9.5"
            onSubmit={handlePrimaryAction}
            disabled={sendDisabled}
            sendLabel={
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
              <ArrowClockwise size={16} weight="bold" />
            ) : (
              <ArrowUp size={16} weight="bold" />
            )}
          </ComposerSendButton>
        }
      />
    );

    return (
      <main
        className={[
          "bp-workspace-theme text-foreground relative flex min-h-0 flex-1 flex-col bg-[#111111]",
          embedded ? "h-full" : "h-dvh",
        ].join(" ")}
      >
        {manualSetupAction}
        {/* Centered logo+composer unit, nudged above the optical center so the
            stack reads as one block (opencode-style empty state). */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <div className="animate-in fade-in slide-in-from-bottom-2 w-full max-w-[680px] -translate-y-[9%] duration-700">
            {/* Hero prompt: sets the learner's task in a single line. Sized on a
                30px / mb-8 rhythm so the heading + composer read as one block. */}
            <h1 className="mb-8 text-center [font-family:var(--font-ai)] text-[30px] font-medium tracking-[-0.02em]">
              What skill do you want to Master?
            </h1>

            {/* Composer fills the 680px column — wider than the heading so the
                stack reads as heading-over-box, matching the empty-state ref. */}
            <div className="mx-auto w-full">{heroComposer}</div>

            {/* Example chips to kill blank-page paralysis: tapping one submits
                it as the learner's first answer. Presentational otherwise. */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {["an ML engineer", "a systems programmer", "a quant"].map(
                (example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={!sessionReady || effectiveIsStreaming}
                    onClick={() => submitText(example)}
                    className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[12.5px] text-[#9a9a9a] transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-[#d0d0d0] disabled:opacity-50"
                  >
                    {example}
                  </button>
                ),
              )}
            </div>
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
      {manualSetupAction}
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
                        if (
                          latestProjectBuildPart?.messageId !== message.id ||
                          latestProjectBuildPart.partIndex !== partIndex
                        ) {
                          return null;
                        }
                        // Prefer the durable row when the stream is down, so a
                        // reopened tab renders live progress instead of the
                        // snapshot frozen at disconnect.
                        const build =
                          projectBuild ?? (part.data as ProjectBuildState);
                        return (
                          <ProjectBuildScreen
                            key={`${message.id}-build-${partIndex}`}
                            state={build}
                            preview={preview}
                            startPending={continueLearning.isPending}
                            retryDisabled={effectiveIsStreaming}
                            onStartLearning={() => {
                              if (preview || !build.sessionId) return;
                              continueLearning.mutate({
                                sessionId: build.sessionId,
                              });
                            }}
                            onRetry={() => {
                              // Any persisted build resumes deterministically;
                              // only a pre-build card needs another model turn.
                              if (build.sessionId) {
                                void regenerate({
                                  body: { resumeBuild: true },
                                });
                                return;
                              }
                              void regenerate();
                            }}
                          />
                        );
                      }
                      if ((part.type as string) === "tool-askStartingPoint") {
                        const answered =
                          (part as { state?: string }).state ===
                          "output-available";
                        // Superseded: the learner typed past the question
                        // instead of tapping. Keep the collapsed ✓ line when
                        // answered; drop the interactive card otherwise.
                        if (!answered && index < lastUserMessageIndex) {
                          return null;
                        }
                        return (
                          <StartingPointCheck
                            key={`${message.id}-start-${partIndex}`}
                            part={part}
                            busy={isStreaming}
                            onAnswer={({ toolCallId, tier, label }) =>
                              void addToolResult({
                                tool: "askStartingPoint",
                                toolCallId,
                                output: { tier, label },
                              } as Parameters<typeof addToolResult>[0])
                            }
                          />
                        );
                      }
                      if ((part.type as string) === "tool-createProject") {
                        return (
                          <CreateProjectConfirm
                            key={`${message.id}-confirm-${partIndex}`}
                            part={part}
                            busy={isStreaming || setStartingPoint.isPending}
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
                            onChangeStartingPoint={
                              sessionId
                                ? (tier: StartingPointTier) =>
                                    setStartingPoint.mutateAsync({
                                      sessionId,
                                      tier,
                                    })
                                : undefined
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
              <div
                role="status"
                aria-live="polite"
                className="text-foreground/65 flex items-center gap-2.5 text-[15px] tracking-[-0.01em]"
              >
                <StatusSpinner />
                <TextShimmer text="Thinking" />
              </div>
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

        {!projectReady ? <ChatComposerDock>{composer}</ChatComposerDock> : null}
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
