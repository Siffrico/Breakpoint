"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { ArrowClockwise, ArrowUp } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { previewOnboardingStates } from "~/features/training/lib/training-preview";
import { useTRPC } from "~/trpc/react";
import { AssistantRichText } from "./assistant-rich-text";

type OnboardingState =
  | RouterOutputs["training"]["startOnboarding"]
  | RouterOutputs["training"]["onboardingState"];

type OnboardingVariant = "default" | "landscape";

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
  embedded = false,
  sessionId: sessionIdProp,
  initialState = null,
  variant = "default",
  onRunningChange,
  onTurnCountChange,
}: {
  preview?: boolean;
  embedded?: boolean;
  sessionId?: string;
  initialState?: OnboardingState | null;
  variant?: OnboardingVariant;
  onRunningChange?: (isRunning: boolean) => void;
  onTurnCountChange?: (count: number) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const startedRef = useRef(false);
  const [previewStep, setPreviewStep] = useState(0);
  const [previewState, setPreviewState] = useState<OnboardingState | null>(null);

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

  // Replace the placeholder intro with the server-seeded transcript once
  // startOnboarding returns, so message ids stay stable across reloads.
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

  // Preview mode: walk through static states without calling any APIs.
  useEffect(() => {
    if (!preview) return;
    const next =
      previewOnboardingStates[previewStep] ?? previewOnboardingStates[0] ?? null;
    setPreviewState(next);
  }, [preview, previewStep]);

  const [answer, setAnswer] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Source of messages to render: real chat in normal mode, static state in preview.
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

  // Autofocus the composer once the session is ready.
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

  const isLandscape = variant === "landscape";
  const isDarkHero = !embedded && !isLandscape;

  const shellClassName = isLandscape
    ? "bg-background text-foreground relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    : embedded
      ? "relative flex min-h-[70vh] flex-col text-white"
      : "relative flex min-h-screen flex-col overflow-hidden bg-[#050709] text-white";
  const contentClassName = isLandscape
    ? "relative z-10 mx-auto flex w-full max-w-[42rem] flex-col px-6 pt-10 pb-10"
    : embedded
      ? "relative z-10 mx-auto flex w-full max-w-[54rem] flex-col py-8"
      : "relative z-10 mx-auto flex w-full max-w-[54rem] flex-col px-5 pt-16 pb-12 sm:pt-24";

  return (
    <main className={shellClassName}>
      {isLandscape ? (
        <>
          <div className="bg-background pointer-events-none absolute inset-0" />
          <div className="from-foreground/[0.025] pointer-events-none absolute inset-0 bg-gradient-to-b via-transparent to-transparent" />
        </>
      ) : null}

      {isDarkHero ? (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: [
                "radial-gradient(ellipse 120% 80% at 50% 0%, rgba(15, 30, 80, 0.5) 0%, transparent 50%)",
                "radial-gradient(ellipse 100% 70% at 50% 100%, rgba(10, 25, 70, 0.45) 0%, transparent 45%)",
                "radial-gradient(ellipse 60% 100% at 0% 50%, rgba(12, 28, 75, 0.4) 0%, transparent 40%)",
                "radial-gradient(ellipse 60% 100% at 100% 50%, rgba(12, 28, 75, 0.4) 0%, transparent 40%)",
                "radial-gradient(ellipse 140% 140% at 50% 50%, transparent 40%, rgba(8, 20, 60, 0.3) 70%, rgba(15, 35, 90, 0.15) 100%)",
              ].join(", "),
            }}
          />
          <GrainOverlay />
        </>
      ) : null}

      <div className={contentClassName}>
        {/* Static framing — does NOT mirror assistant turns. */}
        {!isStarted ? (
          <div className="mb-8">
            <h1
              className={[
                "font-display tracking-[-0.03em]",
                isLandscape
                  ? "text-foreground text-xl sm:text-2xl"
                  : "text-white text-2xl sm:text-3xl",
              ].join(" ")}
            >
              Define your track
            </h1>
            <p
              className={[
                "mt-2 text-sm leading-6",
                isLandscape ? "text-muted-foreground" : "text-white/50",
              ].join(" ")}
            >
              Answer a few questions and we'll build a curriculum tuned to who
              you want to become.
            </p>
          </div>
        ) : null}

        {/* Transcript — the conversation IS the artifact. */}
        <div
          className="flex flex-col gap-3"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {renderMessages.map((message, index) => {
            const text = extractText(message);
            if (!text) return null;
            const isLast = index === renderMessages.length - 1;
            const showCaret =
              isLast && message.role === "assistant" && isStreaming;
            return (
              <MessageBubble
                key={message.id}
                role={message.role}
                text={text}
                showCaret={showCaret}
                isLandscape={isLandscape}
              />
            );
          })}
          {showTypingIndicator ? (
            <TypingIndicator isLandscape={isLandscape} />
          ) : null}
          {hasError && !isStreaming ? (
            <InlineErrorRow
              isLandscape={isLandscape}
              message={error?.message ?? "That turn errored."}
              onRetry={() => void regenerate()}
            />
          ) : null}
        </div>

        {curriculum?.ok ? (
          <CurriculumReadyCard
            curriculum={curriculum}
            sessionId={sessionId}
            isLandscape={isLandscape}
            onOpen={openGeneratedWorkspace}
          />
        ) : null}

        {!hasReadyCurriculum ? (
          <Composer
            answer={answer}
            setAnswer={setAnswer}
            onPrimaryAction={handlePrimaryAction}
            isStreaming={isStreaming}
            hasError={hasError}
            sessionReady={preview || Boolean(sessionId)}
            isLandscape={isLandscape}
            composerRef={composerRef}
          />
        ) : null}

        {!isStarted && !hasReadyCurriculum ? (
          <SuggestionChips
            suggestions={SUGGESTIONS}
            disabled={!preview && (!sessionId || isStreaming)}
            onSelect={(suggestion) => submitText(suggestion)}
            isLandscape={isLandscape}
          />
        ) : null}
      </div>
    </main>
  );
}

function MessageBubble({
  role,
  text,
  showCaret,
  isLandscape,
}: {
  role: UIMessage["role"];
  text: string;
  showCaret: boolean;
  isLandscape: boolean;
}) {
  const isAssistant = role === "assistant";
  const wrapperClass = [
    "max-w-[44ch] px-3.5 py-2.5",
    isLandscape
      ? isAssistant
        ? "border-border bg-card text-card-foreground border"
        : "border-border bg-secondary text-foreground ml-auto border"
      : isAssistant
        ? "border border-white/8 bg-white/[0.03] text-white/82"
        : "ml-auto border border-white/12 bg-white/[0.06] text-white/95",
  ].join(" ");

  return (
    <div className={wrapperClass}>
      <div className="text-[13px] leading-6">
        {isAssistant ? <AssistantRichText content={text} /> : text}
        {showCaret ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-[1em] w-[1px] translate-y-[2px] animate-pulse bg-current align-baseline"
          />
        ) : null}
      </div>
    </div>
  );
}

function TypingIndicator({ isLandscape }: { isLandscape: boolean }) {
  const dotClass = isLandscape
    ? "size-1 rounded-full bg-foreground/40"
    : "size-1 rounded-full bg-white/40";
  return (
    <div
      className={[
        "flex max-w-[44ch] items-center gap-1 px-3.5 py-3",
        isLandscape
          ? "border-border bg-card border"
          : "border border-white/8 bg-white/[0.03]",
      ].join(" ")}
      aria-label="Assistant is thinking"
    >
      <span className={`${dotClass} animate-pulse [animation-delay:0ms]`} />
      <span className={`${dotClass} animate-pulse [animation-delay:140ms]`} />
      <span className={`${dotClass} animate-pulse [animation-delay:280ms]`} />
    </div>
  );
}

function InlineErrorRow({
  isLandscape,
  message,
  onRetry,
}: {
  isLandscape: boolean;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className={[
        "flex max-w-[44ch] items-center justify-between gap-3 px-3.5 py-2.5",
        isLandscape
          ? "border-destructive/40 bg-destructive/[0.06] text-destructive border"
          : "border border-red-400/30 bg-red-500/[0.08] text-red-200",
      ].join(" ")}
    >
      <span className="text-[12px] leading-5">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className={[
          "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium",
          isLandscape
            ? "hover:bg-destructive/10"
            : "hover:bg-white/[0.06] text-white/90",
        ].join(" ")}
      >
        <ArrowClockwise size={11} weight="bold" />
        Retry
      </button>
    </div>
  );
}

function Composer({
  answer,
  setAnswer,
  onPrimaryAction,
  isStreaming,
  hasError,
  sessionReady,
  isLandscape,
  composerRef,
}: {
  answer: string;
  setAnswer: (value: string) => void;
  onPrimaryAction: () => void;
  isStreaming: boolean;
  hasError: boolean;
  sessionReady: boolean;
  isLandscape: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const primaryLabel = isStreaming
    ? "Stop generating"
    : hasError
      ? "Retry last turn"
      : "Send answer";
  const primaryDisabled = isStreaming
    ? false
    : hasError
      ? false
      : !sessionReady || answer.trim().length === 0;

  return (
    <div
      className={[
        "mt-4 w-full",
        isLandscape
          ? "border-border bg-card border backdrop-blur"
          : "border border-white/[0.06] bg-[#111111]",
      ].join(" ")}
    >
      <Textarea
        ref={composerRef}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onPrimaryAction();
          }
        }}
        placeholder={
          !sessionReady
            ? "Starting..."
            : isStreaming
              ? "Draft a reply while she's still thinking..."
              : "Type your answer..."
        }
        className={
          isLandscape
            ? "text-foreground placeholder:text-muted-foreground min-h-24 resize-none rounded-none border-0 bg-transparent px-5 py-4 text-sm leading-6 shadow-none focus-visible:ring-0"
            : "min-h-24 resize-none rounded-none border-0 bg-transparent px-5 py-4 text-sm leading-6 text-white shadow-none placeholder:text-white/20 focus-visible:ring-0"
        }
      />

      <div
        className={[
          "flex items-center justify-between px-5 py-3",
          isLandscape ? "border-border border-t" : "border-t border-white/8",
        ].join(" ")}
      >
        <div
          className={[
            "text-[11px]",
            isLandscape ? "text-muted-foreground" : "text-white/30",
          ].join(" ")}
        >
          {isStreaming
            ? "Thinking..."
            : hasError
              ? "Last turn errored — retry?"
              : "⏎ send · ⇧⏎ newline"}
        </div>
        <Button
          type="button"
          onClick={onPrimaryAction}
          disabled={primaryDisabled}
          aria-label={primaryLabel}
          className={
            isLandscape
              ? "bg-foreground text-background hover:bg-foreground/90 inline-flex h-8 items-center gap-1.5 rounded-none px-3 text-xs font-medium"
              : "inline-flex h-8 items-center gap-1.5 rounded-none bg-white px-3 text-xs font-medium text-black hover:bg-white/90"
          }
        >
          {isStreaming ? (
            <>
              <span
                aria-hidden="true"
                className={[
                  "size-2",
                  isLandscape ? "bg-background" : "bg-black",
                ].join(" ")}
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
      </div>
    </div>
  );
}

function SuggestionChips({
  suggestions,
  disabled,
  onSelect,
  isLandscape,
}: {
  suggestions: readonly string[];
  disabled: boolean;
  onSelect: (suggestion: string) => void;
  isLandscape: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(suggestion)}
          className={
            isLandscape
              ? "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 min-w-[14rem] flex-1 border px-4 py-3 text-left text-xs leading-5 transition-colors"
              : "min-w-[14rem] flex-1 border border-white/[0.06] bg-[#111111] px-4 py-3 text-left text-xs leading-5 text-white/40 transition-colors hover:border-white/12 hover:text-white/80 disabled:opacity-50"
          }
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
  isLandscape,
  onOpen,
}: {
  curriculum: Extract<CurriculumToolOutput, { ok: true }>;
  sessionId: string | null;
  isLandscape: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className={[
        "mt-4 w-full px-5 py-4",
        isLandscape
          ? "border-border bg-card border backdrop-blur"
          : "border border-white/12 bg-white/[0.04]",
      ].join(" ")}
    >
      <div
        className={[
          "text-[11px] tracking-wide uppercase",
          isLandscape ? "text-muted-foreground" : "text-white/40",
        ].join(" ")}
      >
        Curriculum ready
      </div>
      <div
        className={[
          "mt-1 text-base font-medium",
          isLandscape ? "text-foreground" : "text-white",
        ].join(" ")}
      >
        {curriculum.title}
      </div>
      <div
        className={[
          "mt-1 text-xs leading-5",
          isLandscape ? "text-muted-foreground" : "text-white/55",
        ].join(" ")}
      >
        {curriculum.unitCount} {curriculum.unitCount === 1 ? "unit" : "units"} ·
        ready to start
      </div>
      <div className="mt-4">
        <Button
          type="button"
          onClick={onOpen}
          disabled={!sessionId}
          className={
            isLandscape
              ? "bg-foreground text-background hover:bg-foreground/90 h-8 rounded-none px-4 text-xs font-medium"
              : "h-8 rounded-none bg-white px-4 text-xs font-medium text-black hover:bg-white/90"
          }
        >
          Open my workspace →
        </Button>
      </div>
    </div>
  );
}

const GRAIN_SIZE = 128;

function GrainOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const generate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = GRAIN_SIZE;
    canvas.height = GRAIN_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 18;
    }
    ctx.putImageData(imageData, 0, 0);
    setDataUrl(canvas.toDataURL("image/png"));
  }, []);

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      {dataUrl ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${dataUrl})`,
            backgroundRepeat: "repeat",
            backgroundSize: `${GRAIN_SIZE}px ${GRAIN_SIZE}px`,
          }}
        />
      ) : null}
    </>
  );
}
