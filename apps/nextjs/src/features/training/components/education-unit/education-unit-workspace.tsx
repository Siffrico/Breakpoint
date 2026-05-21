"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsOutSimple, ArrowUp, Microphone, Plus } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { toast } from "@acme/ui/toast";

import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import { useTRPC } from "~/trpc/react";

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

const COLLAPSED_COMPOSER_MIN_HEIGHT = 64;
const COLLAPSED_COMPOSER_MAX_HEIGHT = 220;

const getComposerHeightBounds = (element: HTMLTextAreaElement | null) => {
  if (typeof window === "undefined") {
    return {
      minHeight: COLLAPSED_COMPOSER_MIN_HEIGHT,
      maxHeight: COLLAPSED_COMPOSER_MAX_HEIGHT,
    };
  }

  const viewportRatioMax = Math.floor(window.innerHeight * 0.24);
  const viewportCap = Math.min(
    COLLAPSED_COMPOSER_MAX_HEIGHT,
    viewportRatioMax,
  );

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

function UserResponse({ text }: { text: string }) {
  return (
    <div className="py-5 font-sans">
      <div className="max-w-[78%] rounded-[16px] bg-[#eaf1ff] px-5 py-3 text-[14px] leading-[1.4] tracking-[-0.015em] text-[#0a63d8] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
        {text}
      </div>
    </div>
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
      className="text-foreground/42 hover:text-foreground/72 hover:bg-foreground/[0.04] flex h-7 w-7 items-center justify-center rounded-[3px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

const getActiveWorkspaceNodeId = (state: AiWorkspace["state"]) =>
  state?.recallUnitId ?? state?.activeUnitId ?? null;

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

const getIntroMessage = (workspace: AiWorkspace | null): AiWorkspaceIntroMessage | null =>
  (
    workspace as (AiWorkspace & {
      introMessage?: AiWorkspaceIntroMessage | null;
    }) | null
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
  const trpc = useTRPC();
  const [messages, setMessages] = useState(aiWorkspace?.messages ?? []);
  const [response, setResponse] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onStateChange?.(unit);
  }, [onStateChange, unit]);

  useEffect(() => {
    setMessages(aiWorkspace?.messages ?? []);
  }, [aiWorkspace?.messages]);

  useEffect(() => {
    setTimeout(
      () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  }, [messages.length]);

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

  const submitAiWorkspaceMessage = useMutation(
    trpc.training.submitAiWorkspaceMessage.mutationOptions({
      onSuccess: (result) => {
        setMessages(result.messages);
        setResponse("");
        if (getActiveWorkspaceNodeId(result.state) !== unit.nodeId) {
          router.refresh();
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isRunning = submitAiWorkspaceMessage.isPending;
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
    ? "Reply to continue."
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
    if (!message || preview) {
      return;
    }

    await submitAiWorkspaceMessage.mutateAsync({
      sessionId,
      message,
    });
    setIsExpanded(false);
  };

  const visibleMessages = messages;
  const renderedMessages =
    workspaceUnavailable
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
        ]
      : visibleMessages.map((message) =>
          message.role === "assistant" ? (
            <PromptTurn
              key={`ai-${message.sequence}`}
              prompt={message.content}
              helper={null}
            />
          ) : (
            <UserResponse
              key={`ai-${message.sequence}`}
              text={message.content}
            />
          ),
        );

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
                className="text-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.05] disabled:text-foreground/20 absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-[3px] transition-colors outline-none focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <ArrowsOutSimple size={13} weight="bold" />
              </button>

              <textarea
                ref={composerTextareaRef}
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                disabled={!canCompose}
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
                      className="border-foreground/18 border-t-foreground/55 h-4 w-4 animate-spin rounded-full border"
                    />
                  ) : null}
                  <ComposerIconButton label="Voice input">
                    <Microphone size={18} />
                  </ComposerIconButton>
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={!response.trim() || isRunning || preview || !canCompose}
                    aria-label="Submit response"
                    className="bg-foreground text-background hover:bg-foreground/85 disabled:bg-foreground/25 inline-flex h-8 w-8 items-center justify-center rounded-[5px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
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
