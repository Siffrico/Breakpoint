"use client";

import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CaretDown,
  CaretRight,
  ChatCircle,
  Copy,
  PencilSimple,
} from "@phosphor-icons/react";
import { DefaultChatTransport, isTextUIPart } from "ai";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { ChatComposerDock, WorkspaceStatusLine } from "@acme/ui/chat";
import { toast } from "@acme/ui/toast";

import type { UnitCoachCommandIntent } from "~/features/training/lib/unit-coach-commands";
import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import { useTRPC } from "~/trpc/react";
import {
  educationUnitResponseDraftKey,
  shouldClearSubmittedDraft,
  useAutosavedResponseDraft,
} from "~/features/training/hooks/use-autosaved-response-draft";
import { NotionComposer } from "./notion-composer";
import { WorkspaceComposerInput } from "./workspace-composer-input";

type EducationUnit = RouterOutputs["training"]["unit"];
type AiWorkspace = RouterOutputs["training"]["aiWorkspace"];
interface AiWorkspaceIntroMessage {
  prompt: string;
  helper: string | null;
}
interface WorkspaceFallbackTurn {
  helper: string | null;
  prompt: string;
  canCompose: boolean;
}
type WorkspaceStreamStatus =
  | "preparing"
  | "thinking"
  | "evaluating"
  | "saving"
  | "complete";
interface WorkspaceStatusData {
  status: WorkspaceStreamStatus;
  label: string;
}
interface WorkspaceChatData extends Record<string, unknown> {
  "workspace-status": WorkspaceStatusData;
  // The committed assistant reply when it diverged from the streamed text
  // (a restarted model attempt); rendered instead of the text parts.
  "workspace-final-text": { text: string };
  "workspace-turn-state": {
    state: NonNullable<AiWorkspace["state"]>;
  };
}
interface WorkspaceChatMetadata {
  action?: "submit_answer";
  synthetic?: boolean;
  difficultyDirectiveReason?: string;
  failed?: boolean;
  turnId?: string;
}
type WorkspaceChatMessage = UIMessage<WorkspaceChatMetadata, WorkspaceChatData>;

const AUTO_SCROLL_BOTTOM_THRESHOLD = 160;
const CHAT_COLUMN_CLASS =
  "mx-auto w-[calc(100%-2rem)] max-w-[48.9rem] sm:w-[calc(100%-3rem)]";
const PREVIEW_RESPONSE_DELAY_MS = 450;

const isViewportNearBottom = () => {
  if (typeof window === "undefined") return true;

  const scrollableHeight = document.documentElement.scrollHeight;
  const viewportBottom = window.scrollY + window.innerHeight;

  return scrollableHeight - viewportBottom < AUTO_SCROLL_BOTTOM_THRESHOLD;
};

const makePreviewWorkspaceMessage = (
  role: "user" | "assistant",
  text: string,
  metadata?: WorkspaceChatMetadata,
): WorkspaceChatMessage => ({
  id: `preview-workspace-${role}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`,
  role,
  metadata,
  parts: [{ type: "text", text }],
});

const createWorkspaceTurnId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const buildPreviewWorkspaceReply = (answerText: string) => {
  const normalized = answerText.trim();

  return `## Feedback

This is a useful answer because it names the central failure: the loop optimized the benchmark, not the real deployment outcome.

What I would strengthen:

1. **Loop design** — hold back private evaluation sets and rotate tasks the agent cannot inspect.
2. **Evaluation strategy** — include production-like runtime checks, adversarial tests, and human review for subtle logic errors.
3. **Experiment proposal policy** — require every proposed training change to predict the failure mode it should reduce, not just the score it should raise.

\`\`\`txt
agent proposes change
        ↓
private eval + runtime tests + regression suite
        ↓
ship only if real-user proxy improves
\`\`\`

Your submitted answer started with: "${normalized.slice(0, 180)}${normalized.length > 180 ? "..." : ""}"

Now revise the loop as if the benchmark is an untrusted signal the agent might learn to exploit.`;
};

function PromptTurn({
  prompt,
  helper,
  difficultyDirectiveReason = null,
  statusLabel = null,
}: {
  prompt: string;
  helper?: string | null;
  difficultyDirectiveReason?: string | null;
  statusLabel?: string | null;
}) {
  return (
    <section className="py-3 font-sans">
      {/* Assistant content fills the column edge-to-edge (no extra px), so its
          right edge matches the submitted-answer receipt's right edge. */}
      <div className={CHAT_COLUMN_CLASS}>
        {statusLabel ? (
          <WorkspaceStatusLine
            label={statusLabel}
            className={prompt.trim() ? "mb-4" : undefined}
          />
        ) : null}
        {difficultyDirectiveReason ? (
          <div className="border-foreground/[0.10] bg-foreground/[0.035] text-foreground/52 mb-3 inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] leading-4">
            <span className="truncate">{difficultyDirectiveReason}</span>
          </div>
        ) : null}
        {prompt.trim() ? (
          // Live turns are smoothed server-side by smoothStream, so render the
          // streamed text straight — no client-side pacing needed.
          <AssistantRichText
            content={prompt}
            className="text-foreground/94 text-[15px] leading-7 [&_h2]:mt-0 [&_h2]:!mb-3 [&_h2]:text-[18px] [&_h2]:font-semibold [&_li]:my-1 [&_li]:leading-7 [&_ol]:!my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:!my-3 [&_strong]:font-semibold [&_ul]:!my-3 [&_ul]:list-disc [&_ul]:pl-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          />
        ) : null}
        {helper ? (
          <AssistantRichText
            content={helper}
            className="text-foreground/48 mt-3 text-[13px] leading-6 [&_em]:not-italic"
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
  failed = false,
  canRevise,
  onRevise,
  onRetry,
  onAskCoach,
}: {
  text: string;
  pending?: boolean;
  failed?: boolean;
  canRevise: boolean;
  onRevise: () => void;
  onRetry?: () => void;
  onAskCoach?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wordCount = countWords(text);
  const wordLabel = `${wordCount} ${wordCount === 1 ? "word" : "words"}`;

  const copySubmittedAnswer = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Answer copied.");
    } catch {
      toast.error("Answer could not be copied.");
    }
  };

  return (
    <section className="py-3 font-sans">
      <div className={CHAT_COLUMN_CLASS}>
        {/* Mirrors the user bubble: column-relative width, right-anchored,
            radius matched to the composer (6px). */}
        <div className="border-foreground/[0.14] bg-foreground/[0.055] ml-auto w-fit max-w-[min(82%,64ch)] rounded-[6px] border">
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="text-foreground/72 hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.045] flex min-h-10 w-full items-center justify-between gap-4 px-3.5 text-left text-[13px] transition-colors outline-none focus:outline-none"
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
              {failed ? (
                <span className="text-destructive/80">Failed to send</span>
              ) : null}
            </span>
            <span className="text-foreground/38 shrink-0">{wordLabel}</span>
          </button>

          {isOpen ? (
            <div className="border-foreground/[0.1] border-t">
              <div className="px-3.5 py-3">
                <p className="text-foreground/82 text-[14px] leading-6 whitespace-pre-wrap">
                  {text}
                </p>
              </div>
              <div className="border-foreground/[0.08] flex flex-wrap items-center gap-1 border-t px-2 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => void copySubmittedAnswer()}
                  className="text-foreground/48 hover:text-foreground h-7 border-0 px-2 text-[11px] shadow-none before:hidden"
                >
                  <Copy size={13} />
                  Copy
                </Button>
                {failed && onRetry ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={onRetry}
                    className="text-destructive/80 hover:text-destructive h-7 border-0 px-2 text-[11px] shadow-none before:hidden"
                  >
                    Retry
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={!canRevise}
                  onClick={onRevise}
                  className="text-foreground/48 hover:text-foreground h-7 border-0 px-2 text-[11px] shadow-none before:hidden"
                >
                  <PencilSimple size={13} />
                  Revise
                </Button>
                {onAskCoach ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={onAskCoach}
                    className="text-foreground/48 hover:text-foreground h-7 border-0 px-2 text-[11px] shadow-none before:hidden"
                  >
                    <ChatCircle size={13} />
                    Ask coach about this
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
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

const transcriptToChatMessages = (
  workspace: AiWorkspace | null,
  sessionId: string,
): WorkspaceChatMessage[] =>
  (workspace?.messages ?? []).map((message) => ({
    id: `workspace-${sessionId}-${message.sequence}`,
    role: message.role,
    metadata: message.metadata ?? undefined,
    parts: [{ type: "text", text: message.content }],
  }));

const getChatMessageText = (message: WorkspaceChatMessage) => {
  // A workspace-final-text part supersedes the streamed text: the server
  // sends it when a restarted model attempt committed a different reply than
  // the partials already on screen.
  for (const part of message.parts) {
    if (
      part.type === "data-workspace-final-text" &&
      typeof part.data === "object" &&
      part.data != null &&
      "text" in part.data &&
      typeof part.data.text === "string"
    ) {
      return part.data.text;
    }
  }

  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
};

const getWorkspaceStatus = (
  message: WorkspaceChatMessage,
): WorkspaceStatusData | null => {
  let status: WorkspaceStatusData | null = null;

  for (const part of message.parts) {
    if (part.type !== "data-workspace-status") continue;
    if (
      typeof part.data === "object" &&
      part.data != null &&
      "status" in part.data &&
      "label" in part.data &&
      typeof part.data.label === "string"
    ) {
      status = part.data as WorkspaceStatusData;
    }
  }

  return status;
};

export function EducationUnitWorkspace({
  unit,
  sessionId,
  preview = false,
  aiWorkspace = null,
  embedded = false,
  onStateChange,
  onRunningChange,
  onRunCommand,
  onAskCoachAboutAnswer,
}: {
  unit: EducationUnit;
  sessionId: string;
  preview?: boolean;
  aiWorkspace?: AiWorkspace | null;
  embedded?: boolean;
  onStateChange?: (state: EducationUnit) => void;
  onRunningChange?: (isRunning: boolean) => void;
  onRunCommand?: (intent: UnitCoachCommandIntent) => void;
  onAskCoachAboutAnswer?: (answer: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewIsRunning, setPreviewIsRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const shouldAutoFollowRef = useRef(true);
  const pendingSubmissionRef = useRef<string | null>(null);
  const pendingDraftKeyRef = useRef<string | null>(null);
  const errorHandledRef = useRef(false);
  const pendingTurnIdRef = useRef<string | null>(null);
  const initialChatMessages = useMemo(
    () => transcriptToChatMessages(aiWorkspace, sessionId),
    [aiWorkspace, sessionId],
  );
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport<WorkspaceChatMessage>({
        api: "/api/training/workspace/chat",
      }),
    [],
  );
  const {
    messages: chatMessages,
    setMessages,
    sendMessage,
    clearError,
    status,
    error,
    stop,
  } = useChat<WorkspaceChatMessage>({
    id: `training-workspace-${sessionId}`,
    messages: initialChatMessages,
    transport: chatTransport,
    // Batch UI updates during streaming (SDK-native render throttling). The
    // word-level reveal itself is handled server-side by smoothStream
    // because this route streams structured output, not a plain text stream.
    experimental_throttle: 50,
    onFinish: (finishState) => {
      if (!shouldClearSubmittedDraft(finishState)) return;
      clearSubmittedDraft(pendingDraftKeyRef.current);
      pendingDraftKeyRef.current = null;
      pendingSubmissionRef.current = null;
    },
  });
  const isRunning = status === "submitted" || status === "streaming";
  const effectiveIsRunning = preview ? previewIsRunning : isRunning;

  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current != null) {
        window.clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    onStateChange?.(unit);
  }, [onStateChange, unit]);

  // Reconcile the chat with the server transcript only while no turn is
  // running — a mid-stream rebase would wipe live streaming messages. Failed
  // optimistic sends were never persisted, so they survive the rebase
  // explicitly; dropping them would silently discard the retry affordance.
  useEffect(() => {
    if (effectiveIsRunning) return;
    setMessages((current) => {
      const failedSends = current.filter(
        (message) => message.role === "user" && message.metadata?.failed,
      );
      return failedSends.length > 0
        ? [...initialChatMessages, ...failedSends]
        : initialChatMessages;
    });
  }, [effectiveIsRunning, initialChatMessages, setMessages]);

  const streamState = useMemo(() => {
    for (
      let messageIndex = chatMessages.length - 1;
      messageIndex >= 0;
      messageIndex -= 1
    ) {
      const message = chatMessages[messageIndex];
      if (!message) continue;
      for (const part of message.parts) {
        if (part.type !== "data-workspace-turn-state") continue;
        const data = part.data;
        if (typeof data === "object" && data != null && "state" in data) {
          return data.state as NonNullable<AiWorkspace["state"]>;
        }
      }
    }
    return aiWorkspace?.state ?? null;
  }, [aiWorkspace?.state, chatMessages]);

  // One refetch per unit, at the moment the stream reports it mastered: the
  // shell's Next Unit gate lives in the aiWorkspace query, which is otherwise
  // bootstrap-only (staleTime: Infinity) — without this the button never
  // enables. Skipped when bootstrap already knew (page loaded post-mastery).
  const masteredInvalidatedRef = useRef(false);
  useEffect(() => {
    masteredInvalidatedRef.current = false;
  }, [unit.nodeId]);
  useEffect(() => {
    if (preview || effectiveIsRunning) return;
    if (streamState?.educationStage !== "mastered") return;
    if (aiWorkspace?.unitAdvanceGate.status === "enabled") return;
    if (masteredInvalidatedRef.current) return;
    masteredInvalidatedRef.current = true;
    void queryClient.invalidateQueries({
      queryKey: trpc.training.aiWorkspace.queryKey({ sessionId }),
    });
  }, [
    aiWorkspace?.unitAdvanceGate.status,
    effectiveIsRunning,
    preview,
    queryClient,
    sessionId,
    streamState?.educationStage,
    trpc.training.aiWorkspace,
  ]);

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

  const chatTextLength = useMemo(
    () =>
      chatMessages.reduce(
        (length, message) => length + getChatMessageText(message).length,
        0,
      ),
    [chatMessages],
  );

  useEffect(() => {
    if (!shouldAutoFollowRef.current) return;

    const frameId = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [chatMessages.length, chatTextLength, status]);

  const introMessage = getIntroMessage(aiWorkspace);
  const fallbackTurn = getFallbackTurn(unit);
  const latestAssistantPromptId = useMemo(() => {
    const assistantPromptCount = chatMessages.filter(
      (message) =>
        message.role === "assistant" &&
        getChatMessageText(message).trim().length > 0,
    ).length;
    return assistantPromptCount > 0
      ? `assistant:${assistantPromptCount - 1}`
      : `initial:${unit.activeStage}`;
  }, [chatMessages, unit.activeStage]);
  const responseDraftKey = preview
    ? null
    : educationUnitResponseDraftKey({
        projectId: sessionId,
        unitId: unit.nodeId,
        promptId: latestAssistantPromptId,
      });
  const {
    value: response,
    setValue: setResponse,
    status: draftStatus,
    markSubmitted,
    restoreSubmitted: restoreSubmittedDraft,
    clearSubmitted: clearSubmittedDraft,
  } = useAutosavedResponseDraft({
    enabled: !preview,
    storageKey: responseDraftKey,
  });
  const awaitingUnitAdvance =
    aiWorkspace?.unitAdvanceGate.status === "enabled" ||
    streamState?.educationStage === "mastered";
  const workspaceUnavailable = !preview && aiWorkspace == null;
  const missingTranscriptForResumedUnit =
    !preview &&
    aiWorkspace != null &&
    chatMessages.length === 0 &&
    !introMessage &&
    unit.activeStage !== "challenge";
  const canCompose =
    !workspaceUnavailable &&
    !missingTranscriptForResumedUnit &&
    !awaitingUnitAdvance &&
    fallbackTurn.canCompose;
  const composerPlaceholder = canCompose
    ? "Submit your answer."
    : workspaceUnavailable
      ? "Refresh the workspace before continuing."
      : missingTranscriptForResumedUnit
        ? "Refresh to resume this unit safely."
        : awaitingUnitAdvance
          ? "Press Next Unit to continue."
          : "This unit is complete.";

  useEffect(() => {
    onRunningChange?.(effectiveIsRunning);
    return () => onRunningChange?.(false);
  }, [effectiveIsRunning, onRunningChange]);

  useEffect(() => {
    if (status !== "error" || !error || errorHandledRef.current) return;

    const errorTimer = window.setTimeout(() => {
      if (errorHandledRef.current) return;
      errorHandledRef.current = true;
      const pendingSubmission = pendingSubmissionRef.current;
      if (pendingSubmission) {
        restoreSubmittedDraft(pendingDraftKeyRef.current, pendingSubmission);
      }
      pendingDraftKeyRef.current = null;
      pendingSubmissionRef.current = null;
      const failedTurnId = pendingTurnIdRef.current;
      setMessages((current) =>
        current.map((message) =>
          message.role === "user" && message.metadata?.turnId === failedTurnId
            ? { ...message, metadata: { ...message.metadata, failed: true } }
            : message,
        ),
      );
      toast.error("AI feedback could not be prepared.");
    }, 0);

    return () => window.clearTimeout(errorTimer);
  }, [error, restoreSubmittedDraft, setMessages, status]);

  useEffect(() => {
    if (status !== "error") {
      errorHandledRef.current = false;
    }
  }, [status]);

  const handleSubmit = async (override?: string, retryTurnId?: string) => {
    const message = (override ?? response).trim();
    if (!message || effectiveIsRunning) {
      return;
    }

    if (preview) {
      setResponse("");
      setIsExpanded(false);
      setPreviewIsRunning(true);
      const userMessage = makePreviewWorkspaceMessage("user", message, {
        action: "submit_answer",
      });
      setMessages((current) => [...current, userMessage]);

      previewTimeoutRef.current = window.setTimeout(() => {
        const assistantMessage = makePreviewWorkspaceMessage(
          "assistant",
          buildPreviewWorkspaceReply(message),
        );
        setMessages((current) => [...current, assistantMessage]);
        setPreviewIsRunning(false);
        previewTimeoutRef.current = null;
      }, PREVIEW_RESPONSE_DELAY_MS);
      return;
    }

    clearError();
    pendingSubmissionRef.current = message;
    pendingDraftKeyRef.current = markSubmitted();
    setIsExpanded(false);
    const turnId = retryTurnId ?? createWorkspaceTurnId();
    pendingTurnIdRef.current = turnId;
    if (retryTurnId) {
      setMessages((current) =>
        current.filter(
          (item) =>
            !(item.role === "user" && item.metadata?.turnId === retryTurnId),
        ),
      );
    }

    try {
      await sendMessage(
        {
          text: message,
          metadata: { action: "submit_answer", turnId },
        },
        {
          body: {
            action: "submit_answer",
            sessionId,
            message,
            turnId,
          },
        },
      );
    } catch {
      if (!errorHandledRef.current) {
        errorHandledRef.current = true;
        const pendingDraftKey = pendingDraftKeyRef.current;
        pendingSubmissionRef.current = null;
        pendingDraftKeyRef.current = null;
        restoreSubmittedDraft(pendingDraftKey, message);
        setMessages((current) =>
          current.map((item) =>
            item.role === "user" && item.metadata?.turnId === turnId
              ? { ...item, metadata: { ...item.metadata, failed: true } }
              : item,
          ),
        );
        toast.error("AI feedback could not be prepared.");
      }
    }
  };

  const startAnswerRevision = (text: string) => {
    setResponse(text);
    setIsExpanded(false);
    window.requestAnimationFrame(() => {
      const textarea = composerTextareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(text.length, text.length);
      textarea?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleStop = () => {
    if (preview) {
      if (previewTimeoutRef.current != null) {
        window.clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
      setPreviewIsRunning(false);
      return;
    }
    void stop();
  };

  const visibleMessages = chatMessages.filter(
    (message) => !(message.role === "user" && message.metadata?.synthetic),
  );
  const latestVisibleUserMessageId = [...visibleMessages]
    .reverse()
    .find((message) => message.role === "user")?.id;
  const latestAssistantMessageId = [...chatMessages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;
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
          ]
        : visibleMessages.map((message) => {
            const content = getChatMessageText(message);
            if (message.role === "assistant") {
              const isLiveAssistant =
                effectiveIsRunning && message.id === latestAssistantMessageId;
              const liveStatus = isLiveAssistant
                ? getWorkspaceStatus(message)
                : null;
              return (
                <PromptTurn
                  key={message.id}
                  prompt={content}
                  helper={null}
                  difficultyDirectiveReason={
                    message.metadata?.difficultyDirectiveReason ?? null
                  }
                  statusLabel={
                    liveStatus && liveStatus.status !== "complete"
                      ? liveStatus.label
                      : null
                  }
                />
              );
            }

            return (
              <SubmittedAnswerReceipt
                key={message.id}
                text={content}
                pending={
                  effectiveIsRunning &&
                  message.id === latestVisibleUserMessageId
                }
                failed={message.metadata?.failed === true}
                canRevise={canCompose && !effectiveIsRunning}
                onRevise={() => startAnswerRevision(content)}
                onRetry={
                  message.metadata?.failed && message.metadata.turnId
                    ? () => void handleSubmit(content, message.metadata?.turnId)
                    : undefined
                }
                onAskCoach={
                  onAskCoachAboutAnswer
                    ? () => onAskCoachAboutAnswer(content)
                    : undefined
                }
              />
            );
          });

  const inputZone = (
    <div className={embedded ? "bg-background shrink-0" : "mt-10"}>
      <div className="font-sans">
        <WorkspaceComposerInput
          value={response}
          onValueChange={setResponse}
          onSubmit={() => void handleSubmit()}
          onStop={handleStop}
          onExpand={() => setIsExpanded(true)}
          onRunCoachCommand={onRunCommand}
          disabled={!canCompose || effectiveIsRunning}
          isRunning={effectiveIsRunning}
          textareaRef={composerTextareaRef}
          placeholder={composerPlaceholder}
        />
        <div className="mt-2.5 flex items-center justify-end">
          {draftStatus !== "idle" ? (
            <span
              aria-live="polite"
              className="text-foreground/36 text-[11px] leading-5"
            >
              {draftStatus === "saving" ? "Saving…" : "Saved"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  const expandedOverlay = (
    <NotionComposer
      open={isExpanded}
      initialMarkdown={response}
      placeholder={composerPlaceholder}
      canSubmit={Boolean(response.trim()) && canCompose}
      isSubmitting={effectiveIsRunning}
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
          <div className="flex-1 pt-8 pb-10">
            {renderedMessages}
            <div ref={bottomRef} />
          </div>
          <ChatComposerDock className="mt-auto pt-4 pb-1">
            {inputZone}
          </ChatComposerDock>
        </div>
        {expandedOverlay}
      </>
    );
  }

  return (
    <>
      <main className="bp-page-bg text-foreground min-h-screen px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex w-full flex-col pb-32">
          {renderedMessages}
          <div className="bg-background/95 fixed inset-x-0 bottom-0 z-20 backdrop-blur-sm">
            <div className="mx-auto w-[calc(100%-2rem)] max-w-[48.9rem] py-4 sm:w-[calc(100%-3rem)]">
              {inputZone}
            </div>
          </div>
        </div>
      </main>
      {expandedOverlay}
    </>
  );
}
