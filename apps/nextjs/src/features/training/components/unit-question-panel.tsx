"use client";

import type { UIMessage } from "ai";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@ai-sdk/react";
import {
  ArrowLeft,
  ArrowsIn,
  ArrowsOut,
  ArrowUp,
  X,
} from "@phosphor-icons/react";
import { DefaultChatTransport, isTextUIPart } from "ai";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import type { AskIntent } from "~/features/training/lib/slash-commands";
import { AssistantRichText } from "./assistant-rich-text";

type EducationUnit = RouterOutputs["training"]["unit"];

interface AskChatMetadata {
  // Seed turns (/idk, /explain) carry a hidden user message so the transport
  // has something to send; it must not render as a learner bubble.
  synthetic?: boolean;
}
type AskChatMessage = UIMessage<AskChatMetadata>;

const ASK_COMPOSER_MIN_HEIGHT = 112;
const ASK_COMPOSER_MAX_HEIGHT = 280;

const getAskComposerBounds = (element: HTMLTextAreaElement | null) => {
  if (typeof window === "undefined") {
    return {
      minHeight: ASK_COMPOSER_MIN_HEIGHT,
      maxHeight: ASK_COMPOSER_MAX_HEIGHT,
    };
  }

  const viewportRatioMax = Math.floor(window.innerHeight * 0.26);
  const viewportCap = Math.min(ASK_COMPOSER_MAX_HEIGHT, viewportRatioMax);
  const availableSpaceFromTop = element
    ? Math.floor(window.innerHeight - element.getBoundingClientRect().top - 52)
    : viewportCap;
  const maxHeight = Math.max(
    ASK_COMPOSER_MIN_HEIGHT,
    Math.min(viewportCap, availableSpaceFromTop),
  );

  return {
    minHeight: ASK_COMPOSER_MIN_HEIGHT,
    maxHeight,
  };
};

const syncAskComposerHeight = (element: HTMLTextAreaElement | null) => {
  if (!element) return;

  const { minHeight, maxHeight } = getAskComposerBounds(element);
  element.style.height = "0px";
  const nextHeight = Math.max(
    minHeight,
    Math.min(element.scrollHeight, maxHeight),
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
};

const getMessageText = (message: AskChatMessage) =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");

export function UnitQuestionPanel({
  unit,
  sessionId,
  intent,
  isFocused,
  onClose,
  onToggleFocus,
  onReturnToUnit,
}: {
  unit: EducationUnit;
  sessionId: string;
  intent: AskIntent | null;
  isFocused: boolean;
  onClose: () => void;
  onToggleFocus: () => void;
  onReturnToUnit: () => void;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport<AskChatMessage>({
        api: "/api/training/unit-ask/chat",
      }),
    [],
  );
  const { messages, sendMessage, setMessages, status, error } =
    useChat<AskChatMessage>({
      id: `unit-ask-${sessionId}-${unit.nodeId}`,
      transport,
      experimental_throttle: 50,
    });

  const [question, setQuestion] = useState("");
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const handledNonceRef = useRef<number | null>(null);
  const errorHandledRef = useRef(false);
  const isRunning = status === "submitted" || status === "streaming";

  // Clear the conversation when the active unit changes — answers are scoped to
  // the live scenario, so stale history would be misleading.
  useEffect(() => {
    setMessages([]);
    handledNonceRef.current = null;
  }, [unit.nodeId, setMessages]);

  // Fire a seed turn when a slash command bumps the intent nonce.
  useEffect(() => {
    if (!intent) return;
    if (handledNonceRef.current === intent.nonce) return;
    handledNonceRef.current = intent.nonce;

    void sendMessage(
      { text: `/${intent.kind}`, metadata: { synthetic: true } },
      { body: { sessionId, intent: intent.kind, unitTitle: unit.title } },
    );
  }, [intent, sendMessage, sessionId, unit.title]);

  useEffect(() => {
    if (status !== "error" || !error || errorHandledRef.current) return;
    errorHandledRef.current = true;
    toast.error("The tutor could not respond. Try again.");
  }, [status, error]);

  useEffect(() => {
    if (status !== "error") errorHandledRef.current = false;
  }, [status]);

  useLayoutEffect(() => {
    syncAskComposerHeight(composerTextareaRef.current);
  }, [question]);

  useEffect(() => {
    const handleResize = () =>
      syncAskComposerHeight(composerTextareaRef.current);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const canSubmit = question.trim().length > 0 && !isRunning;

  const handleAsk = () => {
    if (!canSubmit) return;

    const trimmed = question.trim();
    setQuestion("");
    void sendMessage(
      { text: trimmed },
      { body: { sessionId, intent: "freeform", message: trimmed, unitTitle: unit.title } },
    );
  };

  const visibleMessages = messages.filter(
    (message) => !(message.role === "user" && message.metadata?.synthetic),
  );
  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  return (
    <aside className="border-foreground/[0.06] bg-sidebar text-foreground flex h-full min-w-0 flex-col border-l">
      <div className="border-foreground/[0.06] flex h-14 items-center justify-between border-b px-4">
        <div className="min-w-0">
          <div className="text-foreground/80 truncate text-[13px]">
            Unit help
          </div>
          <div className="text-foreground/34 truncate text-[11px]">
            {unit.title}
          </div>
        </div>
        <div className="flex items-center">
          {isFocused && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReturnToUnit}
              className="text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground mr-1 rounded-none border-0 px-2 text-[12px] before:rounded-none"
            >
              <ArrowLeft size={14} />
              Return
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleFocus}
            className="text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground rounded-none border-0 before:rounded-none"
            aria-label={
              isFocused ? "Shrink question panel" : "Focus question panel"
            }
          >
            {isFocused ? <ArrowsIn size={15} /> : <ArrowsOut size={15} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground rounded-none border-0 before:rounded-none"
            aria-label="Close question panel"
          >
            <X size={15} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-6">
          {visibleMessages.length === 0 ? (
            <div className="text-foreground/82 text-[14px] leading-[1.6]">
              <AssistantRichText
                content={`Ask about "${unit.title}" and I’ll answer against the live unit context. Stuck? Type **/idk** in the workspace and I’ll help pinpoint what’s confusing.`}
              />
            </div>
          ) : (
            visibleMessages.map((message) => {
              const content = getMessageText(message);
              if (message.role === "assistant") {
                const isLive = isRunning && message.id === lastAssistantId;
                return (
                  <div
                    key={message.id}
                    className="text-foreground/82 text-[14px] leading-[1.6]"
                  >
                    {content.trim() ? (
                      <AssistantRichText content={content} />
                    ) : isLive ? (
                      <span className="text-foreground/40 text-[13px]">
                        Thinking…
                      </span>
                    ) : null}
                  </div>
                );
              }

              return (
                <div key={message.id} className="flex justify-end">
                  <div className="bg-primary/[0.08] text-primary/90 max-w-[82%] rounded-[14px] px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap">
                    {content}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="border-foreground/[0.08] bg-card focus-within:border-foreground/18 relative rounded-[10px] border shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_18px_-12px_rgba(0,0,0,0.14)] transition-[border-color,box-shadow] duration-150">
          <textarea
            ref={composerTextareaRef}
            aria-label="Ask a question about this unit"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onInput={(event) => syncAskComposerHeight(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleAsk();
              }
            }}
            placeholder="Ask what the unit is really testing, how to start, or what a strong answer should do."
            rows={1}
            className="text-foreground placeholder:text-foreground/30 block min-h-[112px] w-full resize-none bg-transparent px-3.5 pt-3 pb-10 text-[13.5px] leading-[1.55] tracking-[-0.005em] outline-none"
          />
          <Button
            type="button"
            onClick={handleAsk}
            disabled={!canSubmit}
            variant="ghost"
            size="icon"
            className="bg-primary text-primary-foreground hover:bg-primary/90 absolute right-2 bottom-2 size-7 rounded-md border-0 p-0 before:rounded-md"
            aria-label="Ask question"
          >
            <ArrowUp size={13} weight="bold" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
