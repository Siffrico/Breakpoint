"use client";

import type { UIMessage } from "ai";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, isTextUIPart } from "ai";

import type { RouterOutputs, WorkspaceStreamStatus } from "@acme/api";
import { ChatComposerDock, WorkspaceStatusLine } from "@acme/ui/chat";
import { toast } from "@acme/ui/toast";

import type { ExchangeMessage } from "./exchange-grouping";
import type { UnitCoachCommandIntent } from "~/features/training/lib/unit-coach-commands";
import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import {
  educationUnitResponseDraftKey,
  resolveActiveResponseDraftKey,
  shouldClearSubmittedDraft,
  useAutosavedResponseDraft,
} from "~/features/training/hooks/use-autosaved-response-draft";
import { useTRPC } from "~/trpc/react";
import { groupLiveExchanges } from "./exchange-grouping";
import { FocusComposer } from "./focus-composer";
import { MessageActions } from "./message-actions";
// `scenario-anchor.tsx` is retired from the workspace but kept in the tree: the
// header bar it rendered (unit title + Recall badge) is deliberately off-site,
// and the file stands as the reference if that orientation cue is ever wanted
// back.
import { ScenarioPeek, useScenarioPeek } from "./scenario-peek";
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
    passNumber: number;
    state: NonNullable<AiWorkspace["state"]>;
    scenario: AiWorkspaceScenario | null;
  };
}
interface WorkspaceChatMetadata {
  action?: "start_unit" | "submit_answer" | "advance_pass";
  synthetic?: boolean;
  difficultyDirectiveReason?: string;
  passNumber?: number;
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

  return `This is a useful answer because it names the central failure: the loop optimized the benchmark, not the real deployment outcome.

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
  copyable = true,
  streaming = false,
}: {
  prompt: string;
  helper?: string | null;
  difficultyDirectiveReason?: string | null;
  statusLabel?: string | null;
  /** True while this turn's text is still arriving, so words reveal as they land. */
  streaming?: boolean;
  /** False for the notice turns (unavailable, resume-blocked) — those are UI
      copy, not something the learner would ever want on their clipboard. */
  copyable?: boolean;
}) {
  return (
    <section className="py-[13px] font-sans">
      {/* Assistant content fills the column edge-to-edge (no extra px); the
          learner's receipt answers it from the right. `group` scopes the
          hover that reveals this turn's actions. */}
      <div
        className={`${CHAT_COLUMN_CLASS} group`}
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
          // streamed text straight — no client-side pacing needed. The focus
          // reveal is CSS-only on top of whatever cadence the server sends.
          <AssistantRichText
            content={prompt}
            streaming={streaming}
            className="text-foreground/94 [&_h2]:!text-foreground/52 [&_hr]:border-foreground/10 text-[15px] leading-7 [&_h1]:!mt-0 [&_h1]:!mb-3 [&_h1]:!text-[24px] [&_h1]:!leading-8 [&_h1]:!font-semibold [&_h1]:!tracking-[-0.025em] [&_h2]:!mt-7 [&_h2]:!mb-2 [&_h2]:!text-[13px] [&_h2]:!font-medium [&_h2]:!tracking-[0.08em] [&_h3]:!mt-6 [&_h3]:!mb-2 [&_h3]:!text-[17px] [&_h3]:!font-semibold [&_hr]:my-6 [&_li]:my-1 [&_li]:leading-7 [&_ol]:!my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:!my-3 [&_strong]:font-semibold [&_ul]:!my-3 [&_ul]:list-disc [&_ul]:pl-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          />
        ) : null}
        {helper ? (
          <AssistantRichText
            content={helper}
            className="text-foreground/48 mt-3 text-[13px] leading-6 [&_em]:not-italic"
          />
        ) : null}
        {copyable && prompt.trim() ? (
          <MessageActions align="start" text={prompt} />
        ) : null}
      </div>
    </section>
  );
}

function PassDivider() {
  return (
    <div className="flex items-center gap-3 py-5">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        Next section
      </span>
      <span className="bg-border h-px flex-1" />
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
  return (
    <section className="py-[13px] font-sans">
      <div className={CHAT_COLUMN_CLASS}>
        {/* The learner's turn as a right-aligned chat message. The block is
            shrink-to-fit and pushed right by ml-auto, so its right edge lands
            on the column's right edge — the same edge as the composer — while
            a short answer keeps a short bubble. `group` scopes the hover that
            reveals this message's actions. */}
        <div className="group ml-auto w-fit max-w-[65%] min-w-[min(17rem,100%)]">
          {/* No caption: the bubble's position already says whose turn this is.
              The row carries transient send state only — and Retry stays
              outside the hover row, because a send that failed must be
              recoverable without first discovering that hover reveals things. */}
          {pending || failed ? (
            <div className="mb-1.5 flex items-center gap-2 text-[12px]">
              {pending ? (
                <span className="text-foreground/38">Submitting...</span>
              ) : null}
              {failed ? (
                <span className="text-destructive/80">Failed to send</span>
              ) : null}
              {failed && onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-destructive/80 hover:bg-destructive/[0.08] hover:text-destructive rounded-sm px-1.5 py-0.5 transition-colors"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="border-border bg-card rounded-lg border px-4 py-3">
            <p className="text-foreground/88 text-[14px] leading-6 whitespace-pre-wrap">
              {text}
            </p>
          </div>

          <MessageActions
            align="end"
            text={text}
            onEdit={onRevise}
            editDisabled={!canRevise}
            onAskCoach={onAskCoach}
          />
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

const getPassNumber = (message: WorkspaceChatMessage): number | undefined => {
  if (message.metadata?.passNumber) return message.metadata.passNumber;
  for (const part of message.parts) {
    if (
      part.type === "data-workspace-turn-state" &&
      typeof part.data === "object" &&
      part.data !== null &&
      "passNumber" in part.data &&
      typeof part.data.passNumber === "number"
    ) {
      return part.data.passNumber;
    }
  }
  return undefined;
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
  const [previewIsRunning, setPreviewIsRunning] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const shouldAutoFollowRef = useRef(true);
  const pendingSubmissionRef = useRef<string | null>(null);
  const pendingDraftKeyRef = useRef<string | null>(null);
  const pendingTurnIdRef = useRef<string | null>(null);
  const startedUnitRef = useRef<string | null>(null);
  const openingUnitTurnRef = useRef<string | null>(null);
  const [openingUnitFailed, setOpeningUnitFailed] = useState(false);
  const [submittedDraftKey, setSubmittedDraftKey] = useState<string | null>(
    null,
  );
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
    id: `training-workspace-${sessionId}-${unit.nodeId}`,
    messages: initialChatMessages,
    transport: chatTransport,
    // Batch SDK stream updates to one render at most every 50 ms.
    experimental_throttle: 50,
    onFinish: (finishState) => {
      const openingUnitFailed =
        openingUnitTurnRef.current !== null &&
        !shouldClearSubmittedDraft(finishState);
      openingUnitTurnRef.current = null;
      if (openingUnitFailed) {
        startedUnitRef.current = null;
        setOpeningUnitFailed(true);
        return;
      }
      setOpeningUnitFailed(false);
      if (!shouldClearSubmittedDraft(finishState)) return;
      clearSubmittedDraft(pendingDraftKeyRef.current);
      pendingDraftKeyRef.current = null;
      setSubmittedDraftKey(null);
      pendingSubmissionRef.current = null;
      // The turn committed: its user message is now in the server transcript,
      // so it must stop qualifying as an unpersisted send to preserve.
      pendingTurnIdRef.current = null;
    },
    onError: () => {
      if (openingUnitTurnRef.current === null) return;
      startedUnitRef.current = null;
      setOpeningUnitFailed(true);
    },
  });
  const isRunning = status === "submitted" || status === "streaming";
  const effectiveIsRunning = preview ? previewIsRunning : isRunning;

  useEffect(() => {
    const interactionId = aiWorkspace?.state?.interactionId;
    const shouldStart =
      !preview &&
      aiWorkspace != null &&
      chatMessages.length === 0 &&
      aiWorkspace.state?.educationStage === "learning" &&
      interactionId != null &&
      !openingUnitFailed &&
      !effectiveIsRunning;
    if (!shouldStart) return;

    const startKey = `${unit.nodeId}:${interactionId}`;
    if (startedUnitRef.current === startKey) return;
    startedUnitRef.current = startKey;
    const turnId = createWorkspaceTurnId();
    openingUnitTurnRef.current = turnId;
    void sendMessage(undefined, {
      body: {
        action: "start_unit",
        interactionId,
        sessionId,
        turnId,
      },
    }).catch(() => {
      if (openingUnitTurnRef.current !== turnId) return;
      openingUnitTurnRef.current = null;
      startedUnitRef.current = null;
      setOpeningUnitFailed(true);
    });
  }, [
    aiWorkspace,
    chatMessages.length,
    effectiveIsRunning,
    openingUnitFailed,
    preview,
    sendMessage,
    sessionId,
    unit.nodeId,
  ]);

  useEffect(() => {
    if (!openingUnitFailed) return;
    setMessages(initialChatMessages);
  }, [initialChatMessages, openingUnitFailed, setMessages]);

  const retryOpeningUnit = useCallback(() => {
    clearError();
    openingUnitTurnRef.current = null;
    startedUnitRef.current = null;
    setOpeningUnitFailed(false);
  }, [clearError]);

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

  // Reconcile the chat only when the server hands us a *new* transcript, and
  // only while no turn is running — a mid-stream rebase would wipe live
  // streaming messages, and rebasing on the running→idle edge alone would
  // replay the bootstrap-frozen snapshot (aiWorkspace has staleTime:
  // Infinity), erasing the reply that just streamed in. A transcript that
  // arrives mid-stream is applied at the next idle tick. Failed optimistic
  // sends were never persisted, so they survive the rebase explicitly;
  // dropping them would silently discard the retry affordance.
  const reconciledTranscriptRef = useRef<WorkspaceChatMessage[] | null>(null);
  useEffect(() => {
    if (effectiveIsRunning) return;
    if (reconciledTranscriptRef.current === initialChatMessages) return;
    reconciledTranscriptRef.current = initialChatMessages;
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

  // The last turn-state part on the wire. The bootstrap read is frozen
  // (staleTime: Infinity), so this — not `aiWorkspace` — is what stays true as
  // passes advance within a session.
  const latestTurnState = useMemo(() => {
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
          return data as WorkspaceChatData["workspace-turn-state"];
        }
      }
    }
    return null;
  }, [chatMessages]);
  const streamState = latestTurnState?.state ?? aiWorkspace?.state ?? null;

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
    if (streamState?.educationStage !== "complete") return;
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

  const introMessage = getIntroMessage(aiWorkspace);
  const fallbackTurn = getFallbackTurn(unit);
  // A turn that has run reports the brief for the pass it left on the board;
  // before then, the bootstrap read is the only source. Ordering matters — the
  // reverse would show the previous pass's scenario after every advance.
  const scenario = latestTurnState
    ? latestTurnState.scenario
    : getScenario(aiWorkspace);
  const transcriptProjection = useMemo(() => {
    const messagesById = new Map<string, WorkspaceChatMessage>();
    const exchangeMessages: ExchangeMessage[] = [];
    let chatTextLength = 0;
    let assistantPromptCount = 0;
    let scenarioFoundInTranscript = false;

    for (const message of chatMessages) {
      const text = getChatMessageText(message);
      messagesById.set(message.id, message);
      chatTextLength += text.length;

      if (message.role === "assistant" && text.trim().length > 0) {
        assistantPromptCount += 1;
        if (scenario && text.includes(scenario.stateA)) {
          scenarioFoundInTranscript = true;
        }
      }

      if (
        (message.role === "assistant" || message.role === "user") &&
        !(message.role === "user" && message.metadata?.synthetic)
      ) {
        exchangeMessages.push({
          id: message.id,
          role: message.role,
          text,
          failed: message.metadata?.failed === true,
        });
      }
    }

    const grouped = groupLiveExchanges(exchangeMessages);
    const exchangeHistory: typeof grouped.history = [];
    for (const exchange of grouped.history) {
      const previous = exchangeHistory[exchangeHistory.length - 1];
      if (!exchange.answer && exchange.prompt && previous?.prompt) {
        exchangeHistory[exchangeHistory.length - 1] = {
          ...previous,
          prompt: {
            ...previous.prompt,
            text: `${previous.prompt.text}\n\n${exchange.prompt.text}`,
          },
        };
      } else {
        exchangeHistory.push(exchange);
      }
    }

    const exchangeHistoryWithPassBoundaries: {
      exchange: (typeof exchangeHistory)[number];
      passNumber: number | undefined;
      startsPass: boolean;
    }[] = [];
    let previousPassNumber: number | undefined;
    for (const exchange of exchangeHistory) {
      const promptMessage = exchange.prompt
        ? messagesById.get(exchange.prompt.id)
        : undefined;
      const passNumber = promptMessage
        ? getPassNumber(promptMessage)
        : undefined;
      exchangeHistoryWithPassBoundaries.push({
        exchange,
        passNumber,
        startsPass:
          passNumber !== undefined && passNumber !== previousPassNumber,
      });
      previousPassNumber = passNumber ?? previousPassNumber;
    }

    const activePromptMessage = grouped.activePrompt
      ? (messagesById.get(grouped.activePrompt.id) ?? null)
      : null;

    return {
      activePromptMessage,
      chatTextLength,
      exchangeHistoryWithPassBoundaries,
      grouped,
      latestAssistantPromptId:
        assistantPromptCount > 0
          ? `assistant:${assistantPromptCount - 1}`
          : `initial:${unit.activeStage}`,
      messagesById,
      scenarioMissingFromTranscript:
        scenario !== null && !scenarioFoundInTranscript,
    };
  }, [chatMessages, scenario, unit.activeStage]);

  useEffect(() => {
    if (!shouldAutoFollowRef.current) return;

    const frameId = window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [chatMessages.length, status, transcriptProjection.chatTextLength]);

  const { latestAssistantPromptId, scenarioMissingFromTranscript } =
    transcriptProjection;
  const currentResponseDraftKey = preview
    ? null
    : educationUnitResponseDraftKey({
        projectId: sessionId,
        unitId: unit.nodeId,
        promptId: latestAssistantPromptId,
      });
  const responseDraftKey = resolveActiveResponseDraftKey({
    currentKey: currentResponseDraftKey,
    submittedKey: submittedDraftKey,
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
      // The pin deliberately survives recovery. Releasing it here would hand
      // the draft key back to the live prompt count, and the restored answer
      // would only stay in the composer for as long as that count happens to
      // match what it was at submit time. The next submit re-pins it and
      // `onFinish` clears it, so holding it is also what the learner wants:
      // they are editing an answer to the prompt they already answered.
      restoreSubmittedDraft(pendingDraftKey, pendingSubmission);
      setMessages((current) => {
        const failedMessageIndex = current.findIndex(
          (message) =>
            message.role === "user" &&
            message.metadata?.turnId === failedTurnId,
        );
        return current.flatMap((message, index) => {
          if (index > failedMessageIndex && message.role === "assistant") {
            return [];
          }
          return message.role === "user" &&
            message.metadata?.turnId === failedTurnId
            ? [{ ...message, metadata: { ...message.metadata, failed: true } }]
            : [message];
        });
      });
      toast.error(toastMessage);
    },
    [restoreSubmittedDraft, setMessages],
  );
  const awaitingUnitAdvance =
    aiWorkspace?.unitAdvanceGate.status === "enabled" ||
    streamState?.educationStage === "complete";
  const awaitingPassAdvance =
    !preview && streamState?.educationStage === "awaiting_next_pass";
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
    !awaitingPassAdvance &&
    (recallIsLive || (!awaitingUnitAdvance && fallbackTurn.canCompose));
  const composerPlaceholder = canCompose
    ? "Submit your answer."
    : workspaceUnavailable
      ? "Refresh the workspace before continuing."
      : awaitingNextUnitContent
        ? "Preparing the next unit…"
        : missingTranscriptForResumedUnit
          ? "Refresh to resume this unit safely."
          : awaitingPassAdvance
            ? "Press Enter to continue."
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

    const interactionId = streamState?.interactionId;
    if (!interactionId) {
      toast.error("Refresh the workspace before submitting this response.");
      return;
    }
    clearError();
    pendingSubmissionRef.current = message;
    pendingDraftKeyRef.current = markSubmitted();
    setSubmittedDraftKey(pendingDraftKeyRef.current);
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
            interactionId,
            sessionId,
            message,
            turnId,
          },
        },
      );
      setMessages((current) =>
        current.filter(
          (item) => !(item.role === "user" && item.metadata?.failed === true),
        ),
      );
    } catch {
      recoverFailedSubmission(turnId);
    }
  };

  const handleAdvancePass = async () => {
    if (!awaitingPassAdvance || effectiveIsRunning) return;
    const interactionId = streamState.interactionId;
    if (!interactionId) {
      toast.error("Refresh the workspace before continuing.");
      return;
    }
    clearError();
    const turnId = createWorkspaceTurnId();
    try {
      await sendMessage(undefined, {
        body: {
          action: "advance_pass",
          interactionId,
          sessionId,
          turnId,
        },
      });
    } catch {
      toast.error("The next challenge could not be opened. Try again.");
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

  const {
    activePromptMessage,
    exchangeHistoryWithPassBoundaries,
    grouped,
    messagesById,
  } = transcriptProjection;
  const activePrompt = grouped.activePrompt;
  const pendingAnswer = grouped.pendingAnswer;
  const activePassNumber = activePromptMessage
    ? getPassNumber(activePromptMessage)
    : undefined;
  const previousPassNumber =
    exchangeHistoryWithPassBoundaries.at(-1)?.passNumber;
  const activePromptStartsPass =
    activePassNumber !== undefined &&
    activePassNumber > 1 &&
    activePassNumber !== previousPassNumber;
  const activeLiveStatus =
    effectiveIsRunning && activePromptMessage
      ? getWorkspaceStatus(activePromptMessage)
      : null;

  // `stateA` is the challenge itself, so it changes exactly when the pass does
  // — the peek resets on that edge and a stale brief can never sit over a new
  // one.
  const { isOpen: isScenarioOpen, triggerProps } = useScenarioPeek({
    scenarioKey: scenario?.stateA ?? null,
    autoPin: scenarioMissingFromTranscript,
  });

  // With the anchor bar retired, the trigger floats over the trail's top-right
  // gutter — the edge the sheet arrives from, so the pill reads as the handle
  // that pulls it down. Backdrop blur keeps it legible over prompt text on
  // narrow viewports where the column has no gutter to spare.
  const scenarioTrigger = scenario ? (
    <button
      type="button"
      {...triggerProps}
      className="border-foreground/[0.12] bg-background/80 text-foreground/72 hover:border-foreground/25 hover:text-foreground/92 absolute top-3 right-4 z-30 touch-none rounded-full border px-2.5 py-0.5 text-[11px] leading-4 backdrop-blur-sm transition-colors duration-150 outline-none select-none focus-visible:ring-1 focus-visible:ring-current motion-reduce:transition-none sm:right-6"
    >
      Scenario
    </button>
  ) : null;

  const trailContent = awaitingNextUnitContent ? (
    <PromptTurn prompt="" statusLabel="Thinking…" />
  ) : workspaceUnavailable ? (
    <PromptTurn
      helper="Workspace unavailable"
      prompt="The AI workspace could not be loaded, so replying here could advance the wrong stage. Refresh the workspace before continuing."
      copyable={false}
    />
  ) : missingTranscriptForResumedUnit ? (
    <PromptTurn
      helper="Resume unavailable"
      prompt={`This unit already has saved progress, but the AI workspace transcript for this stage is missing. Replying here could rewind the lesson. Refresh the workspace before continuing.\n\nCurrent checkpoint: ${fallbackTurn.prompt}`}
      copyable={false}
    />
  ) : (
    <>
      {exchangeHistoryWithPassBoundaries.map(
        ({ exchange, passNumber, startsPass }, index) => (
          <div
            key={
              exchange.prompt?.id ?? exchange.answer?.id ?? `exchange-${index}`
            }
          >
            {startsPass && passNumber !== undefined && passNumber > 1 ? (
              <PassDivider />
            ) : null}
            {exchange.prompt ? (
              <PromptTurn prompt={exchange.prompt.text} />
            ) : null}
            {exchange.answer ? (
              <SubmittedAnswerReceipt
                text={exchange.answer.text}
                canRevise={canCompose && !effectiveIsRunning}
                onRevise={() =>
                  startAnswerRevision(exchange.answer?.text ?? "")
                }
                onAskCoach={
                  onAskCoachAboutAnswer
                    ? () => onAskCoachAboutAnswer(exchange.answer?.text ?? "")
                    : undefined
                }
              />
            ) : null}
          </div>
        ),
      )}

      {activePrompt ? (
        <>
          {activePromptStartsPass ? <PassDivider /> : null}
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
            streaming={effectiveIsRunning}
          />
        </>
      ) : (
        <>
          <PromptTurn
            prompt={
              openingUnitFailed
                ? "The mentor couldn't open this lesson. Nothing was lost."
                : !preview &&
                    aiWorkspace != null &&
                    aiWorkspace.state?.educationStage === "learning"
                  ? ""
                  : (introMessage?.prompt ?? fallbackTurn.prompt)
            }
            helper={
              openingUnitFailed
                ? null
                : !preview &&
                    aiWorkspace != null &&
                    aiWorkspace.state?.educationStage === "learning"
                  ? "Preparing your lesson…"
                  : (introMessage?.helper ?? fallbackTurn.helper)
            }
          />
          {openingUnitFailed ? (
            <div className={CHAT_COLUMN_CLASS}>
              <button
                type="button"
                onClick={retryOpeningUnit}
                className="text-foreground/70 hover:text-foreground mt-2 text-[13px] underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          ) : null}
        </>
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
        const failedMessage = messagesById.get(answer.id);
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
          disabled={(!canCompose && !awaitingPassAdvance) || effectiveIsRunning}
          isRunning={effectiveIsRunning}
          textareaRef={composerTextareaRef}
          placeholder={composerPlaceholder}
          awaitingPassAdvance={awaitingPassAdvance}
          onAdvancePass={() => void handleAdvancePass()}
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
          {/* Own positioning context for the peek and its trigger, clipped so
              the retracted sheet cannot bleed past the top edge — the outer
              wrapper must stay unpositioned for the focus sheet. */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="pt-5 pb-8">
                {trailContent}
                <div ref={bottomRef} />
              </div>
            </div>
            {scenario ? (
              <ScenarioPeek
                scenario={scenario}
                open={isScenarioOpen}
                columnClassName={CHAT_COLUMN_CLASS}
              />
            ) : null}
            {scenarioTrigger}
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
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="pt-5 pb-8">
              {trailContent}
              <div ref={bottomRef} />
            </div>
          </div>
          {scenario ? (
            <ScenarioPeek
              scenario={scenario}
              open={isScenarioOpen}
              columnClassName={CHAT_COLUMN_CLASS}
            />
          ) : null}
          {scenarioTrigger}
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
