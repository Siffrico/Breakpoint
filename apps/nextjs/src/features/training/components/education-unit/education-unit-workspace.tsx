"use client";

import type { UIMessage } from "ai";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import {
  CaretDown,
  CaretRight,
  ChatCircle,
  Copy,
  PencilSimple,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, isTextUIPart } from "ai";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { ChatComposerDock, WorkspaceStatusLine } from "@acme/ui/chat";
import { toast } from "@acme/ui/toast";

import type { ExchangeMessage } from "./exchange-grouping";
import type { UnitCoachCommandIntent } from "~/features/training/lib/unit-coach-commands";
import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import {
  educationUnitResponseDraftKey,
  shouldClearSubmittedDraft,
  useAutosavedResponseDraft,
} from "~/features/training/hooks/use-autosaved-response-draft";
import { useTRPC } from "~/trpc/react";
import { groupLiveExchanges } from "./exchange-grouping";
import { ExchangeReceipt } from "./exchange-receipt";
import { FocusComposer } from "./focus-composer";
import { countWords } from "./receipt-summary";
import { ScenarioAnchor } from "./scenario-anchor";
import {
  ASK_COACH_SOURCE_ATTRIBUTE,
  SelectionAskCoach,
} from "./selection-ask-coach";
import { WorkspaceComposerInput } from "./workspace-composer-input";

type EducationUnit = RouterOutputs["training"]["unit"];
type AiWorkspace = Extract<
  RouterOutputs["training"]["aiWorkspace"],
  { kind: "ready" }
>["workspace"];
interface AiWorkspaceIntroMessage {
  prompt: string;
  helper: string | null;
}
interface AiWorkspaceScenario {
  stateA: string;
  stateB: string;
  frictionNoise: string | null;
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

const isScrolledNearBottom = (element: HTMLElement | null) => {
  if (!element) return true;

  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <
    AUTO_SCROLL_BOTTOM_THRESHOLD
  );
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
      <div
        className={CHAT_COLUMN_CLASS}
        {...{ [ASK_COACH_SOURCE_ATTRIBUTE]: "" }}
      >
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
            className="text-foreground/94 [&_h2]:text-foreground/52 [&_hr]:border-foreground/10 text-[15px] leading-7 [&_h1]:mt-0 [&_h1]:!mb-3 [&_h1]:text-[24px] [&_h1]:leading-8 [&_h1]:font-semibold [&_h1]:tracking-[-0.025em] [&_h2]:mt-7 [&_h2]:!mb-2 [&_h2]:text-[13px] [&_h2]:font-medium [&_h2]:tracking-[0.08em] [&_h3]:mt-6 [&_h3]:!mb-2 [&_h3]:text-[17px] [&_h3]:font-semibold [&_hr]:my-6 [&_li]:my-1 [&_li]:leading-7 [&_ol]:!my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:!my-3 [&_strong]:font-semibold [&_ul]:!my-3 [&_ul]:list-disc [&_ul]:pl-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
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

/**
 * The scenario, read in full. Rendered as an overlay over the trail rather than
 * in place of it: the trail keeps its DOM and its scroll offset, so returning
 * lands exactly where you left, and a reply that streams in while you are
 * reading just accumulates behind the panel.
 */
function ScenarioPanel({ scenario }: { scenario: AiWorkspaceScenario }) {
  return (
    <div className="bg-background absolute inset-0 z-10 overflow-y-auto">
      <div className={`${CHAT_COLUMN_CLASS} py-6 font-sans`}>
        <h2 className="text-foreground/52 text-[13px] font-medium tracking-[0.08em]">
          THE SITUATION
        </h2>
        <p className="text-foreground/94 mt-2 text-[15px] leading-7">
          {scenario.stateA}
        </p>

        <h2 className="text-foreground/52 mt-7 text-[13px] font-medium tracking-[0.08em]">
          WHAT DONE LOOKS LIKE
        </h2>
        <p className="text-foreground/94 mt-2 text-[15px] leading-7">
          {scenario.stateB}
        </p>

        {scenario.frictionNoise ? (
          <>
            <h2 className="text-foreground/52 mt-7 text-[13px] font-medium tracking-[0.08em]">
              COMPLICATIONS
            </h2>
            <p className="text-foreground/94 mt-2 text-[15px] leading-7">
              {scenario.frictionNoise}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

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
        {/* Mirrors the user bubble: column-relative width, right-anchored. */}
        <div className="border-foreground/[0.14] bg-foreground/[0.055] ml-auto w-fit max-w-[min(82%,64ch)] rounded-md border">
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

const getScenario = (
  workspace: AiWorkspace | null,
): AiWorkspaceScenario | null =>
  (
    workspace as
      | (AiWorkspace & { scenario?: AiWorkspaceScenario | null })
      | null
  )?.scenario ?? null;

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

  return message.parts.reduce(
    (text, part) => (isTextUIPart(part) ? text + part.text : text),
    "",
  );
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

function EducationUnitWorkspaceComponent({
  unit,
  sessionId,
  preview = false,
  aiWorkspace = null,
  advancePending = false,
  embedded = false,
  onStateChange,
  onRunningChange,
  onRunCommand,
  onAskCoachAboutAnswer,
  onAskCoachAboutSelection,
  onAdvanceUnit,
}: {
  unit: EducationUnit;
  sessionId: string;
  preview?: boolean;
  aiWorkspace?: AiWorkspace | null;
  advancePending?: boolean;
  embedded?: boolean;
  onStateChange?: (state: EducationUnit) => void;
  onRunningChange?: (isRunning: boolean) => void;
  onRunCommand?: (intent: UnitCoachCommandIntent) => void;
  onAskCoachAboutAnswer?: (answer: string) => void;
  onAskCoachAboutSelection?: (selection: string) => void;
  onAdvanceUnit?: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const missionEligibility = useQuery({
    ...trpc.missions.eligibility.queryOptions({
      unitContentId: unit.id,
      sessionId,
    }),
    enabled: !preview && unit.activeStage === "complete",
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isScenarioOpen, setIsScenarioOpen] = useState(false);
  const [previewIsRunning, setPreviewIsRunning] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const shouldAutoFollowRef = useRef(true);
  const pendingSubmissionRef = useRef<string | null>(null);
  const pendingDraftKeyRef = useRef<string | null>(null);
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
        (message) =>
          message.role === "user" &&
          (message.metadata?.failed === true ||
            message.metadata?.turnId === pendingTurnIdRef.current),
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

  // One refetch when a finished stream hands the live chat to a different
  // unit (a recall interlude completing, or a recall becoming due): the
  // bootstrap-frozen aiWorkspace still points at the previous unit's
  // transcript, and the server read is the source of truth for the handoff.
  const bootstrapLiveUnitId = aiWorkspace?.state
    ? (aiWorkspace.state.activeUnitId ?? aiWorkspace.state.recallUnitId)
    : null;
  const streamLiveUnitId = streamState
    ? (streamState.activeUnitId ?? streamState.recallUnitId)
    : null;
  const liveUnitInvalidatedRef = useRef<string | null>(null);
  useEffect(() => {
    if (preview || effectiveIsRunning) return;
    if (streamLiveUnitId == null || bootstrapLiveUnitId == null) return;
    if (streamLiveUnitId === bootstrapLiveUnitId) return;
    if (liveUnitInvalidatedRef.current === streamLiveUnitId) return;
    liveUnitInvalidatedRef.current = streamLiveUnitId;
    void queryClient.invalidateQueries({
      queryKey: trpc.training.aiWorkspace.queryKey({ sessionId }),
    });
  }, [
    bootstrapLiveUnitId,
    effectiveIsRunning,
    preview,
    queryClient,
    sessionId,
    streamLiveUnitId,
    trpc.training.aiWorkspace,
  ]);

  // Auto-follow tracks the internal trail scroller, not the window: the
  // scenario anchor and composer are fixed, so the trail is the only thing
  // that moves.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateAutoFollow = () => {
      shouldAutoFollowRef.current = isScrolledNearBottom(container);
    };

    updateAutoFollow();
    container.addEventListener("scroll", updateAutoFollow, { passive: true });
    window.addEventListener("resize", updateAutoFollow);

    return () => {
      container.removeEventListener("scroll", updateAutoFollow);
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
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [chatMessages.length, chatTextLength, status]);

  const introMessage = getIntroMessage(aiWorkspace);
  const fallbackTurn = getFallbackTurn(unit);
  const scenario = getScenario(aiWorkspace);
  const hasScenario = scenario !== null;

  // Close on any change of which scenario is live. Covers both directions:
  // a scenario disappearing mid-read, and the next pass's scenario arriving —
  // which must not silently reopen the panel over a chat the learner returned
  // to. Only ever closes, so it cannot fight the learner's own toggle.
  useEffect(() => {
    setIsScenarioOpen(false);
  }, [unit.nodeId, hasScenario]);
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
    markSubmitted,
    restoreSubmitted: restoreSubmittedDraft,
    clearSubmitted: clearSubmittedDraft,
  } = useAutosavedResponseDraft({
    enabled: !preview,
    storageKey: responseDraftKey,
  });

  const recoverFailedSubmission = useCallback(
    (
      expectedTurnId?: string,
      toastMessage = "AI feedback could not be prepared.",
    ) => {
      const pendingSubmission = pendingSubmissionRef.current;
      const failedTurnId = pendingTurnIdRef.current;

      if (
        !pendingSubmission ||
        !failedTurnId ||
        (expectedTurnId != null && failedTurnId !== expectedTurnId)
      ) {
        return;
      }

      const pendingDraftKey = pendingDraftKeyRef.current;
      pendingSubmissionRef.current = null;
      pendingDraftKeyRef.current = null;
      pendingTurnIdRef.current = null;
      restoreSubmittedDraft(pendingDraftKey, pendingSubmission);
      setMessages((current) =>
        current.map((message) =>
          message.role === "user" && message.metadata?.turnId === failedTurnId
            ? { ...message, metadata: { ...message.metadata, failed: true } }
            : message,
        ),
      );
      toast.error(toastMessage);
    },
    [restoreSubmittedDraft, setMessages],
  );
  const awaitingUnitAdvance =
    aiWorkspace?.unitAdvanceGate.status === "enabled" ||
    streamState?.educationStage === "mastered";
  const awaitingNextUnitContent =
    advancePending ||
    (aiWorkspace?.state?.activeUnitId != null &&
      aiWorkspace.state.activeUnitId !== unit.nodeId &&
      aiWorkspace.state.recallUnitId == null &&
      aiWorkspace.messages.length === 0);
  // A live recall reopens a completed unit's chat, so the unit's own stage
  // gating (which reads "complete") must not lock the composer — the next
  // submit runs the recall checkpoint, not the finished unit.
  const recallIsLive = streamState?.recallUnitId != null;
  // Enter-to-advance must never intercept a recall answer: the gate can be
  // enabled (active unit mastered) while a recall interlude has the composer
  // live, and it stays moot once the optimistic transition is pending.
  const enterAdvancesUnit =
    awaitingUnitAdvance && !recallIsLive && !awaitingNextUnitContent;
  const workspaceUnavailable = !preview && aiWorkspace == null;
  const missingTranscriptForResumedUnit =
    !preview &&
    aiWorkspace != null &&
    !awaitingNextUnitContent &&
    chatMessages.length === 0 &&
    !introMessage &&
    unit.activeStage !== "challenge";
  const canCompose =
    !workspaceUnavailable &&
    !missingTranscriptForResumedUnit &&
    !awaitingNextUnitContent &&
    (recallIsLive || (!awaitingUnitAdvance && fallbackTurn.canCompose));
  const composerPlaceholder = canCompose
    ? "Submit your answer."
    : workspaceUnavailable
      ? "Refresh the workspace before continuing."
      : awaitingNextUnitContent
        ? "Preparing the next unit…"
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
    if (status !== "error" || !error) return;

    const errorTimer = window.setTimeout(() => {
      recoverFailedSubmission();
    }, 0);

    return () => window.clearTimeout(errorTimer);
  }, [error, recoverFailedSubmission, status]);

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
      recoverFailedSubmission(turnId);
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
    recoverFailedSubmission(
      pendingTurnIdRef.current ?? undefined,
      "Generation stopped. Your answer is ready to retry.",
    );
    void stop();
  };

  const visibleMessages = chatMessages.filter(
    (message) =>
      (message.role === "assistant" || message.role === "user") &&
      !(message.role === "user" && message.metadata?.synthetic),
  );
  const exchangeMessages: ExchangeMessage[] = visibleMessages.map(
    (message) => ({
      id: message.id,
      role: message.role as "assistant" | "user",
      text: getChatMessageText(message),
      failed: message.metadata?.failed === true,
    }),
  );
  const grouped = groupLiveExchanges(exchangeMessages);
  const activePrompt = grouped.activePrompt;
  const pendingAnswer = grouped.pendingAnswer;
  const activePromptMessage = activePrompt
    ? (chatMessages.find((message) => message.id === activePrompt.id) ?? null)
    : null;
  const activeLiveStatus =
    effectiveIsRunning && activePromptMessage
      ? getWorkspaceStatus(activePromptMessage)
      : null;

  const anchorTitle =
    streamState?.recallUnitTitle ?? streamState?.activeUnitTitle ?? unit.title;
  const anchorStage = streamState?.recallUnitId
    ? "recall"
    : (streamState?.educationStage ?? null);
  const anchorProgress = aiWorkspace?.evaluationProgress
    ? {
        completed: aiWorkspace.evaluationProgress.completedAttempts,
        total: aiWorkspace.evaluationProgress.scenarioCount,
      }
    : null;
  // Rendering is gated on the scenario still being there, not on the flag
  // alone, so a scenario that goes away (pass advance, unit advance) can never
  // leave an empty panel sitting over the trail.
  const showScenario = isScenarioOpen && scenario !== null;

  const trailContent = awaitingNextUnitContent ? (
    <PromptTurn prompt="" statusLabel="Thinking…" />
  ) : workspaceUnavailable ? (
    <PromptTurn
      helper="Workspace unavailable"
      prompt="The AI workspace could not be loaded, so replying here could advance the wrong stage. Refresh the workspace before continuing."
    />
  ) : missingTranscriptForResumedUnit ? (
    <PromptTurn
      helper="Resume unavailable"
      prompt={`This unit already has saved progress, but the AI workspace transcript for this stage is missing. Replying here could rewind the lesson. Refresh the workspace before continuing.\n\nCurrent checkpoint: ${fallbackTurn.prompt}`}
    />
  ) : (
    <>
      {grouped.history.length > 0 ? (
        <div
          className={`${CHAT_COLUMN_CLASS} flex flex-col gap-1.5 pt-1 pb-3 font-sans`}
        >
          {grouped.history.map((exchange, index) => (
            <ExchangeReceipt
              key={
                exchange.prompt?.id ??
                exchange.answer?.id ??
                `exchange-${index}`
              }
              exchange={exchange}
              fallbackTitle={`Exchange ${index + 1}`}
              canRevise={canCompose && !effectiveIsRunning}
              onRevise={startAnswerRevision}
              onAskCoach={onAskCoachAboutAnswer}
            />
          ))}
        </div>
      ) : null}

      {activePrompt ? (
        <PromptTurn
          prompt={activePrompt.text}
          helper={null}
          difficultyDirectiveReason={
            activePromptMessage?.metadata?.difficultyDirectiveReason ?? null
          }
          statusLabel={
            activeLiveStatus && activeLiveStatus.status !== "complete"
              ? activeLiveStatus.label
              : null
          }
        />
      ) : (
        <PromptTurn
          prompt={introMessage?.prompt ?? fallbackTurn.prompt}
          helper={introMessage?.helper ?? fallbackTurn.helper}
        />
      )}

      {pendingAnswer ? (
        <SubmittedAnswerReceipt
          text={pendingAnswer.text}
          pending={effectiveIsRunning}
          canRevise={canCompose && !effectiveIsRunning}
          onRevise={() => startAnswerRevision(pendingAnswer.text)}
          onAskCoach={
            onAskCoachAboutAnswer
              ? () => onAskCoachAboutAnswer(pendingAnswer.text)
              : undefined
          }
        />
      ) : null}

      {grouped.failedAnswers.map((answer) => {
        const failedMessage = chatMessages.find(
          (message) => message.id === answer.id,
        );
        const failedTurnId = failedMessage?.metadata?.turnId;
        return (
          <SubmittedAnswerReceipt
            key={answer.id}
            text={answer.text}
            failed
            canRevise={canCompose && !effectiveIsRunning}
            onRevise={() => startAnswerRevision(answer.text)}
            onRetry={
              failedTurnId
                ? () => void handleSubmit(answer.text, failedTurnId)
                : undefined
            }
            onAskCoach={
              onAskCoachAboutAnswer
                ? () => onAskCoachAboutAnswer(answer.text)
                : undefined
            }
          />
        );
      })}
    </>
  );

  const inputZone = (
    <div className="bg-background shrink-0">
      {missionEligibility.data?.eligible &&
      missionEligibility.data.unitRunId ? (
        <Link
          href={`/workspace/mission?unitRunId=${missionEligibility.data.unitRunId}`}
          className="border-border bg-card hover:bg-muted mb-5 block border p-4 transition-colors"
        >
          <span className="text-sm font-medium">
            🎯 Take it into the real world
          </span>
          <span className="text-muted-foreground mt-1 block text-sm">
            A field mission, built for you. Start mission →
          </span>
        </Link>
      ) : null}
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
          awaitingUnitAdvance={enterAdvancesUnit}
          onAdvanceUnit={onAdvanceUnit}
        />
      </div>
    </div>
  );

  const expandedOverlay = (
    <FocusComposer
      open={isExpanded}
      initialMarkdown={response}
      placeholder={composerPlaceholder}
      columnClassName={CHAT_COLUMN_CLASS}
      canSubmit={Boolean(response.trim()) && canCompose}
      isSubmitting={effectiveIsRunning}
      awaitingUnitAdvance={enterAdvancesUnit}
      onAdvanceUnit={onAdvanceUnit}
      onChange={setResponse}
      onClose={() => setIsExpanded(false)}
      onSubmit={(md) => {
        setResponse(md);
        void handleSubmit(md);
      }}
    />
  );

  const selectionAskCoach = onAskCoachAboutSelection ? (
    <SelectionAskCoach onAsk={onAskCoachAboutSelection} />
  ) : null;

  // Viewport-fixed three-region column: scenario anchor on top, the receipt
  // trail + active exchange scrolling in the middle, composer pinned below.
  // The page itself never scrolls — the trail region does.
  if (embedded) {
    return (
      <>
        {/* The focus sheet (absolute inset-0) pins to the workspace <main>,
            which spans past its own px padding out to the sidebar and wall —
            so this wrapper must stay unpositioned. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <ScenarioAnchor
            title={anchorTitle}
            stage={anchorStage}
            progress={anchorProgress}
            isScenarioOpen={hasScenario ? showScenario : null}
            onToggleScenario={() => setIsScenarioOpen((open) => !open)}
            columnClassName={CHAT_COLUMN_CLASS}
          />
          {/* Own positioning context for the scenario overlay — the outer
              wrapper must stay unpositioned for the focus sheet. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="pt-5 pb-8">
                {trailContent}
                <div ref={bottomRef} />
              </div>
            </div>
            {showScenario && scenario ? (
              <ScenarioPanel scenario={scenario} />
            ) : null}
          </div>
          <ChatComposerDock className="shrink-0 pt-2 pb-2">
            {inputZone}
          </ChatComposerDock>
          {expandedOverlay}
        </div>
        {selectionAskCoach}
      </>
    );
  }

  return (
    <>
      <main className="bp-page-bg text-foreground relative flex h-dvh flex-col px-5 pt-3 sm:px-8 lg:px-10">
        <ScenarioAnchor
          title={anchorTitle}
          stage={anchorStage}
          progress={anchorProgress}
          isScenarioOpen={hasScenario ? showScenario : null}
          onToggleScenario={() => setIsScenarioOpen((open) => !open)}
          columnClassName={CHAT_COLUMN_CLASS}
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="pt-5 pb-8">
              {trailContent}
              <div ref={bottomRef} />
            </div>
          </div>
          {showScenario && scenario ? (
            <ScenarioPanel scenario={scenario} />
          ) : null}
        </div>
        <div className="bg-background/95 shrink-0 backdrop-blur-sm">
          <div className="mx-auto w-[calc(100%-2rem)] max-w-[48.9rem] pt-3 pb-5 sm:w-[calc(100%-3rem)]">
            {inputZone}
          </div>
        </div>
        {expandedOverlay}
      </main>
      {selectionAskCoach}
    </>
  );
}

export const EducationUnitWorkspace = memo(EducationUnitWorkspaceComponent);
