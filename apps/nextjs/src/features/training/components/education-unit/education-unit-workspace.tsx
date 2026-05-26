"use client";

import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsOutSimple,
  ArrowUp,
  CaretDown,
  CaretRight,
  Microphone,
  Plus,
} from "@phosphor-icons/react";

import type { RouterOutputs } from "@acme/api";
import { toast } from "@acme/ui/toast";

import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import { NotionComposer } from "./notion-composer";

type EducationUnit = RouterOutputs["training"]["unit"];
type AiWorkspace = RouterOutputs["training"]["aiWorkspace"];
type AiWorkspaceIntroMessage = {
  prompt: string;
  helper: string | null;
};
type WorkspaceFallbackTurn = {
  helper: string | null;
  prompt: string;
  canCompose: boolean;
};
type WorkspaceUiState =
  | { status: "idle" }
  | { status: "streaming"; submission: string; assistantText: string }
  | { status: "error"; submission: string; message: string };
type WorkspaceUiAction =
  | { type: "submit"; submission: string }
  | { type: "assistant-delta"; delta: string }
  | { type: "complete" }
  | { type: "error"; message: string }
  | { type: "reset" };

const COLLAPSED_COMPOSER_MIN_HEIGHT = 64;
const COLLAPSED_COMPOSER_MAX_HEIGHT = 220;
const AUTO_SCROLL_BOTTOM_THRESHOLD = 160;

const isViewportNearBottom = () => {
  if (typeof window === "undefined") return true;

  const scrollableHeight = document.documentElement.scrollHeight;
  const viewportBottom = window.scrollY + window.innerHeight;

  return scrollableHeight - viewportBottom < AUTO_SCROLL_BOTTOM_THRESHOLD;
};

const workspaceUiReducer = (
  state: WorkspaceUiState,
  action: WorkspaceUiAction,
): WorkspaceUiState => {
  switch (action.type) {
    case "submit":
      return {
        status: "streaming",
        submission: action.submission,
        assistantText: "",
      };
    case "assistant-delta":
      return state.status === "streaming"
        ? { ...state, assistantText: `${state.assistantText}${action.delta}` }
        : state;
    case "complete":
    case "reset":
      return { status: "idle" };
    case "error":
      return state.status === "streaming"
        ? {
            status: "error",
            submission: state.submission,
            message: action.message,
          }
        : state;
    default:
      return state;
  }
};

const getComposerHeightBounds = (element: HTMLTextAreaElement | null) => {
  if (typeof window === "undefined") {
    return {
      minHeight: COLLAPSED_COMPOSER_MIN_HEIGHT,
      maxHeight: COLLAPSED_COMPOSER_MAX_HEIGHT,
    };
  }

  const viewportRatioMax = Math.floor(window.innerHeight * 0.24);
  const viewportCap = Math.min(COLLAPSED_COMPOSER_MAX_HEIGHT, viewportRatioMax);

  const availableSpaceFromTop = element
    ? Math.floor(window.innerHeight - element.getBoundingClientRect().top - 44)
    : viewportCap;
  const maxHeight = Math.max(
    COLLAPSED_COMPOSER_MIN_HEIGHT,
    Math.min(viewportCap, availableSpaceFromTop),
  );

  return {
    minHeight: COLLAPSED_COMPOSER_MIN_HEIGHT,
    maxHeight,
  };
};

const syncComposerTextareaHeight = ({
  element,
}: {
  element: HTMLTextAreaElement | null;
}) => {
  if (!element) return;

  const { minHeight, maxHeight } = getComposerHeightBounds(element);
  element.style.height = "0px";
  const nextHeight = Math.max(
    minHeight,
    Math.min(element.scrollHeight, maxHeight),
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
};

function PromptTurn({
  prompt,
  helper,
}: {
  prompt: string;
  helper?: string | null;
}) {
  return (
    <section className="py-3 pl-6 font-sans sm:pl-10">
      <div className="max-w-[760px]">
        <AssistantRichText
          content={prompt}
          className="text-foreground text-[20px] leading-[1.55] tracking-[-0.01em] [&_h2]:mt-0 [&_h2]:!mb-4 [&_h2]:text-[30px] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_li]:my-1.5 [&_li]:leading-[1.55] [&_ol]:!my-4 [&_ol]:list-decimal [&_ol]:pl-8 [&_p]:!my-4 [&_strong]:font-semibold [&_ul]:!my-4 [&_ul]:list-disc [&_ul]:pl-8 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        />
        {helper ? (
          <AssistantRichText
            content={helper}
            className="text-foreground/45 mt-10 text-[16px] leading-[1.65] tracking-[-0.01em] [&_em]:not-italic"
          />
        ) : null}
      </div>
    </section>
  );
}

const countWords = (text: string) =>
  text.trim().split(/\s+/).filter(Boolean).length;

function SubmittedAnswerReceipt({
  text,
  pending = false,
}: {
  text: string;
  pending?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wordCount = countWords(text);
  const wordLabel = `${wordCount} ${wordCount === 1 ? "word" : "words"}`;

  return (
    <section className="py-3 pl-6 font-sans sm:pl-10">
      <div className="border-foreground/[0.12] bg-foreground/[0.035] max-w-[760px] border">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="text-foreground/68 hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.045] flex min-h-11 w-full items-center justify-between gap-4 px-3.5 text-left text-[13px] tracking-[-0.01em] transition-colors outline-none focus:outline-none"
          aria-expanded={isOpen}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {isOpen ? (
              <CaretDown size={13} weight="bold" className="shrink-0" />
            ) : (
              <CaretRight size={13} weight="bold" className="shrink-0" />
            )}
            <span className="text-foreground/78 font-medium">
              Submitted answer
            </span>
            {pending ? (
              <span className="text-foreground/38">Submitting...</span>
            ) : null}
          </span>
          <span className="text-foreground/38 shrink-0">{wordLabel}</span>
        </button>

        {isOpen ? (
          <div className="border-foreground/[0.1] border-t px-3.5 py-3">
            <p className="text-foreground/78 text-[14px] leading-[1.55] tracking-[-0.01em] whitespace-pre-wrap">
              {text}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PendingAssistantTurn({ content }: { content: string }) {
  if (content.trim()) {
    return <PromptTurn prompt={content} helper={null} />;
  }

  return (
    <section className="py-3 pl-6 font-sans sm:pl-10">
      <div className="text-foreground/42 flex max-w-[760px] items-center gap-3 text-[14px] tracking-[-0.01em]">
        <div
          aria-label="AI response pending"
          className="border-foreground/18 border-t-foreground/55 size-4 animate-spin rounded-full border"
        />
        <span>Preparing feedback...</span>
      </div>
    </section>
  );
}

function ComposerIconButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="text-foreground/42 hover:text-foreground/72 hover:bg-foreground/[0.04] flex size-7 items-center justify-center rounded-[3px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

const getFallbackTurn = (unit: EducationUnit): WorkspaceFallbackTurn => {
  switch (unit.activeStage) {
    case "mastery_check":
      return {
        helper: unit.masteryCheck?.helper ?? "Concept check",
        prompt:
          unit.masteryCheck?.prompt ??
          "Continue from the current concept check before moving on.",
        canCompose: true,
      };
    case "transfer_challenge":
      return {
        helper: unit.transferChallenge?.helper ?? "Transfer challenge",
        prompt:
          unit.transferChallenge?.prompt ??
          "Apply the concept in the current transfer scenario.",
        canCompose: true,
      };
    case "revision":
      return {
        helper: "Revision",
        prompt:
          unit.implementationReview?.requiredRevision ??
          unit.implementationReview?.summary ??
          "Revise the current build directly against the latest review.",
        canCompose: true,
      };
    case "complete":
      return {
        helper: "Complete",
        prompt: unit.nextStep ?? unit.assessmentFeedback ?? "Ready to move on.",
        canCompose: false,
      };
    case "challenge":
    default:
      return {
        helper: unit.challenge.helper,
        prompt: unit.challenge.prompt,
        canCompose: true,
      };
  }
};

const getIntroMessage = (
  workspace: AiWorkspace | null,
): AiWorkspaceIntroMessage | null =>
  (
    workspace as
      | (AiWorkspace & {
          introMessage?: AiWorkspaceIntroMessage | null;
        })
      | null
  )?.introMessage ?? null;

export function EducationUnitWorkspace({
  unit,
  sessionId,
  preview = false,
  aiWorkspace = null,
  embedded = false,
  onStateChange,
  onRunningChange,
}: {
  unit: EducationUnit;
  sessionId: string;
  preview?: boolean;
  aiWorkspace?: AiWorkspace | null;
  embedded?: boolean;
  onStateChange?: (state: EducationUnit) => void;
  onRunningChange?: (isRunning: boolean) => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(aiWorkspace?.messages ?? []);
  const [response, setResponse] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [uiState, dispatchUiState] = useReducer(workspaceUiReducer, {
    status: "idle",
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoFollowRef = useRef(true);

  useEffect(() => {
    onStateChange?.(unit);
  }, [onStateChange, unit]);

  useEffect(() => {
    setMessages(aiWorkspace?.messages ?? []);
  }, [aiWorkspace?.messages]);

  useEffect(() => {
    const updateAutoFollow = () => {
      shouldAutoFollowRef.current = isViewportNearBottom();
    };

    updateAutoFollow();
    window.addEventListener("scroll", updateAutoFollow, { passive: true });
    window.addEventListener("resize", updateAutoFollow);

    return () => {
      window.removeEventListener("scroll", updateAutoFollow);
      window.removeEventListener("resize", updateAutoFollow);
    };
  }, []);

  useEffect(() => {
    if (!shouldAutoFollowRef.current) return;

    const frameId = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [messages.length, uiState]);

  useLayoutEffect(() => {
    syncComposerTextareaHeight({
      element: composerTextareaRef.current,
    });
  }, [response]);

  useEffect(() => {
    const handleResize = () =>
      syncComposerTextareaHeight({
        element: composerTextareaRef.current,
      });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isRunning = uiState.status === "streaming";
  const introMessage = getIntroMessage(aiWorkspace);
  const fallbackTurn = getFallbackTurn(unit);
  const workspaceUnavailable = !preview && aiWorkspace == null;
  const missingTranscriptForResumedUnit =
    !preview &&
    aiWorkspace != null &&
    messages.length === 0 &&
    !introMessage &&
    unit.activeStage !== "challenge";
  const canCompose =
    !workspaceUnavailable &&
    !missingTranscriptForResumedUnit &&
    fallbackTurn.canCompose;
  const composerPlaceholder = canCompose
    ? "Submit your answer."
    : workspaceUnavailable
      ? "Refresh the workspace before continuing."
      : missingTranscriptForResumedUnit
        ? "Refresh to resume this unit safely."
        : "This unit is complete.";

  useEffect(() => {
    onRunningChange?.(isRunning);
    return () => onRunningChange?.(false);
  }, [isRunning, onRunningChange]);

  const handleSubmit = async (override?: string) => {
    const message = (override ?? response).trim();
    if (!message || preview || isRunning) {
      return;
    }

    dispatchUiState({ type: "submit", submission: message });
    setResponse("");
    setIsExpanded(false);

    try {
      const result = await fetch("/api/training/workspace/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, message }),
      });

      if (!result.ok) {
        throw new Error(await result.text());
      }

      const reader = result.body?.getReader();
      if (!reader) {
        throw new Error("AI response stream could not be opened.");
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        dispatchUiState({
          type: "assistant-delta",
          delta: decoder.decode(value, { stream: true }),
        });
      }

      const trailingText = decoder.decode();
      if (trailingText) {
        dispatchUiState({ type: "assistant-delta", delta: trailingText });
      }

      dispatchUiState({ type: "complete" });
      router.refresh();
    } catch {
      dispatchUiState({
        type: "error",
        message: "AI feedback could not be prepared.",
      });
      setResponse(message);
      toast.error("AI feedback could not be prepared.");
    }
  };

  const visibleMessages = messages;
  const pendingMessages =
    uiState.status === "streaming" && !preview
      ? [
          <SubmittedAnswerReceipt
            key="pending-submission"
            text={uiState.submission}
            pending
          />,
          <PendingAssistantTurn
            key="pending-assistant"
            content={uiState.assistantText}
          />,
        ]
      : [];
  const renderedMessages = workspaceUnavailable
    ? [
        <PromptTurn
          key="workspace-unavailable"
          helper="Workspace unavailable"
          prompt="The AI workspace could not be loaded, so replying here could advance the wrong stage. Refresh the workspace before continuing."
        />,
      ]
    : missingTranscriptForResumedUnit
      ? [
          <PromptTurn
            key="missing-transcript"
            helper="Resume unavailable"
            prompt={`This unit already has saved progress, but the AI workspace transcript for this stage is missing. Replying here could rewind the lesson. Refresh the workspace before continuing.\n\nCurrent checkpoint: ${fallbackTurn.prompt}`}
          />,
        ]
      : visibleMessages.length === 0
        ? [
            <PromptTurn
              key="initial-prompt"
              prompt={introMessage?.prompt ?? fallbackTurn.prompt}
              helper={introMessage?.helper ?? fallbackTurn.helper}
            />,
          ].concat(pendingMessages)
        : visibleMessages
            .map((message) =>
              message.role === "assistant" ? (
                <PromptTurn
                  key={`ai-${message.sequence}`}
                  prompt={message.content}
                  helper={null}
                />
              ) : (
                <SubmittedAnswerReceipt
                  key={`ai-${message.sequence}`}
                  text={message.content}
                />
              ),
            )
            .concat(pendingMessages);

  const inputZone = (
    <div
      className={
        embedded ? "bg-background shrink-0 px-4 pt-1 pb-3 sm:px-8" : "mt-10"
      }
    >
      <div className={embedded ? "mx-auto w-full max-w-[1820px]" : ""}>
        <div className="font-sans">
          <div className="mx-auto w-full max-w-[760px]">
            <div className="border-foreground/[0.13] bg-sidebar relative flex min-h-[96px] flex-col overflow-hidden border">
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                disabled={!canCompose}
                aria-label="Open as full page"
                title="Open as full page"
                className="text-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.05] disabled:text-foreground/20 absolute top-1.5 right-1.5 z-10 flex size-6 items-center justify-center rounded-[3px] transition-colors outline-none focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <ArrowsOutSimple size={13} weight="bold" />
              </button>

              <textarea
                ref={composerTextareaRef}
                aria-label="Response"
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                disabled={!canCompose || isRunning}
                onInput={(event) =>
                  syncComposerTextareaHeight({
                    element: event.currentTarget,
                  })
                }
                placeholder={composerPlaceholder}
                rows={1}
                className="text-foreground/92 placeholder:text-foreground/30 disabled:text-foreground/45 disabled:placeholder:text-foreground/28 block w-full flex-1 resize-none bg-transparent px-4 pt-3.5 pr-10 pb-1 text-[14px] leading-5 outline-none"
              />

              <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-3.5 pb-2.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <ComposerIconButton label="Add attachment">
                    <Plus size={18} />
                  </ComposerIconButton>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isRunning ? (
                    <div
                      aria-label="Submitting"
                      className="border-foreground/18 border-t-foreground/55 size-4 animate-spin rounded-full border"
                    />
                  ) : null}
                  <ComposerIconButton label="Voice input">
                    <Microphone size={18} />
                  </ComposerIconButton>
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={
                      !response.trim() || isRunning || preview || !canCompose
                    }
                    aria-label="Submit response"
                    className="bg-foreground text-background hover:bg-foreground/85 disabled:bg-foreground/25 inline-flex size-8 items-center justify-center rounded-[5px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
                  >
                    <ArrowUp size={16} weight="bold" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const expandedOverlay = (
    <NotionComposer
      open={isExpanded}
      initialMarkdown={response}
      placeholder={composerPlaceholder}
      canSubmit={Boolean(response.trim()) && canCompose && !preview}
      isSubmitting={isRunning}
      onChange={setResponse}
      onClose={() => setIsExpanded(false)}
      onSubmit={(md) => {
        setResponse(md);
        void handleSubmit(md);
      }}
    />
  );

  if (embedded) {
    return (
      <>
        <div className="flex min-h-full flex-1 flex-col">
          <div className="flex-1 pt-6 pb-8">
            {renderedMessages}
            <div ref={bottomRef} />
          </div>
          <div className="bg-background sticky bottom-0 z-10 -mx-6 mt-auto sm:-mx-10">
            {inputZone}
          </div>
        </div>
        {expandedOverlay}
      </>
    );
  }

  return (
    <>
      <main className="bp-page-bg text-foreground min-h-screen px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col pb-32">
          {renderedMessages}
          <div className="bg-background/95 fixed inset-x-0 bottom-0 z-20 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-3xl px-5 py-4 sm:px-8 lg:px-10">
              {inputZone}
            </div>
          </div>
        </div>
      </main>
      {expandedOverlay}
    </>
  );
}
