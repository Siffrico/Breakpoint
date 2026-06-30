"use client";

import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  CaretDown,
  CaretRight,
  ChatCircle,
  Copy,
  PencilSimple,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { DefaultChatTransport, isTextUIPart } from "ai";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { ChatComposerDock, WorkspaceStatusLine } from "@acme/ui/chat";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@acme/ui/menu";
import { toast } from "@acme/ui/toast";

import type { UnitCoachCommandIntent } from "~/features/training/lib/unit-coach-commands";
import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
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
}
interface WorkspaceChatMetadata {
  action?: "submit_answer" | "next_scenario" | "adjust_difficulty";
  synthetic?: boolean;
  difficultyDirectiveReason?: string;
}
type ManualDifficultySignal = "too_easy" | "too_hard";
type WorkspaceChatMessage = UIMessage<WorkspaceChatMetadata, WorkspaceChatData>;

const AUTO_SCROLL_BOTTOM_THRESHOLD = 160;
const CHAT_COLUMN_CLASS =
  "mx-auto w-[calc(100%-2rem)] max-w-[48.9rem] sm:w-[calc(100%-3rem)]";
const PREVIEW_RESPONSE_DELAY_MS = 450;
const EVALUATION_EDUCATION_STAGES = new Set(["Review", "Test", "Check"]);

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
  skeleton = false,
}: {
  prompt: string;
  helper?: string | null;
  difficultyDirectiveReason?: string | null;
  statusLabel?: string | null;
  skeleton?: boolean;
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
        {skeleton ? (
          <div className="space-y-3 py-1" aria-label="Regenerating scenario">
            <div className="bg-foreground/[0.08] h-4 w-[62%] animate-pulse rounded-full" />
            <div className="bg-foreground/[0.065] h-4 w-[91%] animate-pulse rounded-full" />
            <div className="bg-foreground/[0.065] h-4 w-[84%] animate-pulse rounded-full" />
            <div className="bg-foreground/[0.05] h-4 w-[48%] animate-pulse rounded-full" />
          </div>
        ) : prompt.trim() ? (
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

function DifficultyControl({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (signal: ManualDifficultySignal) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        openOnHover
        delay={80}
        closeDelay={300}
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label="Adjust scenario difficulty"
            title={
              disabled
                ? "Available on active eval and recall scenarios"
                : "Adjust scenario difficulty"
            }
            className="text-foreground/42 hover:text-foreground/82 hover:bg-foreground/[0.045] focus-visible:text-foreground flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-[11px] leading-4 transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
          />
        }
      >
        <SlidersHorizontal size={13} weight="bold" />
        Difficulty
      </MenuTrigger>
      <MenuPopup
        side="top"
        align="start"
        sideOffset={8}
        className="bg-background text-foreground w-32"
      >
        <MenuItem closeOnClick onClick={() => onSelect("too_easy")}>
          Too easy
        </MenuItem>
        <MenuItem closeOnClick onClick={() => onSelect("too_hard")}>
          Too hard
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

const countWords = (text: string) =>
  text.trim().split(/\s+/).filter(Boolean).length;

function SubmittedAnswerReceipt({
  text,
  pending = false,
  canRevise,
  onRevise,
  onAskCoach,
}: {
  text: string;
  pending?: boolean;
  canRevise: boolean;
  onRevise: () => void;
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

const getChatMessageText = (message: WorkspaceChatMessage) =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");

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
  canRequestNextScenario = false,
  onRunCommand,
  onAskCoachAboutAnswer,
}: {
  unit: EducationUnit;
  sessionId: string;
  preview?: boolean;
  aiWorkspace?: AiWorkspace | null;
  embedded?: boolean;
  canRequestNextScenario?: boolean;
  onStateChange?: (state: EducationUnit) => void;
  onRunningChange?: (isRunning: boolean) => void;
  onRunCommand?: (intent: UnitCoachCommandIntent) => void;
  onAskCoachAboutAnswer?: (answer: string) => void;
}) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewIsRunning, setPreviewIsRunning] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "submit_answer" | "next_scenario" | "adjust_difficulty" | null
  >(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const shouldAutoFollowRef = useRef(true);
  const pendingSubmissionRef = useRef<string | null>(null);
  const pendingDraftKeyRef = useRef<string | null>(null);
  const pendingErrorToastRef = useRef<
    "submit_answer" | "next_scenario" | "adjust_difficulty" | null
  >(null);
  const errorHandledRef = useRef(false);
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
      pendingErrorToastRef.current = null;
      setPendingAction(null);
      router.refresh();
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

  useEffect(() => {
    if (effectiveIsRunning) return;
    setMessages(initialChatMessages);
  }, [effectiveIsRunning, initialChatMessages, setMessages]);

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
  const awaitingUnitAdvance = aiWorkspace?.unitAdvanceGate.status === "enabled";
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
    !canRequestNextScenario &&
    fallbackTurn.canCompose;
  const composerPlaceholder = canCompose
    ? "Submit your answer."
    : workspaceUnavailable
      ? "Refresh the workspace before continuing."
      : missingTranscriptForResumedUnit
        ? "Refresh to resume this unit safely."
        : awaitingUnitAdvance
          ? "Press Next Unit to continue."
          : canRequestNextScenario
            ? "Continue to the next scenario."
            : "This unit is complete.";
  const canAdjustDifficulty =
    !preview &&
    !effectiveIsRunning &&
    !workspaceUnavailable &&
    !missingTranscriptForResumedUnit &&
    !awaitingUnitAdvance &&
    !canRequestNextScenario &&
    Boolean(
      aiWorkspace?.state?.mode === "recall" ||
        (aiWorkspace?.state?.mode === "education_unit" &&
          aiWorkspace.state.educationStage != null &&
          EVALUATION_EDUCATION_STAGES.has(aiWorkspace.state.educationStage)),
    );

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
      const pendingAction = pendingErrorToastRef.current;
      if (pendingSubmission) {
        restoreSubmittedDraft(pendingDraftKeyRef.current, pendingSubmission);
      }
      pendingDraftKeyRef.current = null;
      pendingSubmissionRef.current = null;
      pendingErrorToastRef.current = null;
      setPendingAction(null);
      setMessages(initialChatMessages);
      toast.error(
        pendingAction === "next_scenario"
          ? "Next scenario could not be prepared."
          : pendingAction === "adjust_difficulty"
            ? "Difficulty could not be recalibrated."
            : "AI feedback could not be prepared.",
      );
    }, 0);

    return () => window.clearTimeout(errorTimer);
  }, [error, initialChatMessages, restoreSubmittedDraft, setMessages, status]);

  useEffect(() => {
    if (status !== "error") {
      errorHandledRef.current = false;
    }
  }, [status]);

  const handleSubmit = async (override?: string) => {
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
    pendingErrorToastRef.current = "submit_answer";
    setPendingAction("submit_answer");
    setIsExpanded(false);
    const turnId = createWorkspaceTurnId();

    try {
      await sendMessage(
        {
          text: message,
          metadata: { action: "submit_answer" },
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
        pendingErrorToastRef.current = null;
        setPendingAction(null);
        restoreSubmittedDraft(pendingDraftKey, message);
        setMessages(initialChatMessages);
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

  const handleNextScenario = async () => {
    if (preview || effectiveIsRunning || !canRequestNextScenario) {
      return;
    }

    clearError();
    pendingSubmissionRef.current = null;
    pendingErrorToastRef.current = "next_scenario";
    setPendingAction("next_scenario");
    const turnId = createWorkspaceTurnId();

    try {
      await sendMessage(
        {
          text: "Next scenario",
          metadata: { action: "next_scenario", synthetic: true },
        },
        {
          body: {
            action: "next_scenario",
            sessionId,
            turnId,
          },
        },
      );
    } catch {
      if (!errorHandledRef.current) {
        errorHandledRef.current = true;
        pendingSubmissionRef.current = null;
        pendingErrorToastRef.current = null;
        setPendingAction(null);
        setMessages(initialChatMessages);
        toast.error("Next scenario could not be prepared.");
      }
    }
  };

  const handleDifficultyAdjustment = async (signal: ManualDifficultySignal) => {
    if (preview || effectiveIsRunning || !canAdjustDifficulty) {
      return;
    }

    clearError();
    pendingSubmissionRef.current = null;
    pendingErrorToastRef.current = "adjust_difficulty";
    setPendingAction("adjust_difficulty");
    const turnId = createWorkspaceTurnId();

    try {
      await sendMessage(
        {
          text: signal === "too_hard" ? "Too hard" : "Too easy",
          metadata: {
            action: "adjust_difficulty",
            synthetic: true,
          },
        },
        {
          body: {
            action: "adjust_difficulty",
            manualDifficultySignal: signal,
            sessionId,
            turnId,
          },
        },
      );
    } catch {
      if (!errorHandledRef.current) {
        errorHandledRef.current = true;
        pendingSubmissionRef.current = null;
        pendingErrorToastRef.current = null;
        setPendingAction(null);
        setMessages(initialChatMessages);
        toast.error("Difficulty could not be recalibrated.");
      }
    }
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
  const isAdjustingDifficulty =
    effectiveIsRunning && pendingAction === "adjust_difficulty";
  const nextScenarioControl =
    canRequestNextScenario && !effectiveIsRunning && !preview ? (
      <section key="next-scenario-control" className="py-1 font-sans">
        <div className={`${CHAT_COLUMN_CLASS} flex justify-end`}>
          <button
            type="button"
            onClick={handleNextScenario}
            className="text-foreground/42 hover:text-foreground/82 focus-visible:text-foreground bg-transparent text-[12px] leading-5 transition-colors outline-none"
          >
            Next scenario
          </button>
        </div>
      </section>
    ) : null;
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
        : visibleMessages
            .map((message) => {
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
                    skeleton={
                      isLiveAssistant &&
                      isAdjustingDifficulty &&
                      !content.trim()
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
                  canRevise={canCompose && !effectiveIsRunning}
                  onRevise={() => startAnswerRevision(content)}
                  onAskCoach={
                    onAskCoachAboutAnswer
                      ? () => onAskCoachAboutAnswer(content)
                      : undefined
                  }
                />
              );
            })
            .concat(nextScenarioControl ? [nextScenarioControl] : []);

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
        <div className="mt-2.5 flex items-center justify-between">
          <DifficultyControl
            disabled={!canAdjustDifficulty}
            onSelect={(signal) => void handleDifficultyAdjustment(signal)}
          />
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
