"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  ArrowLeft,
  ArrowsIn,
  ArrowsOut,
  ArrowUp,
  X,
} from "@phosphor-icons/react";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  DefaultChatTransport,
  isTextUIPart,
} from "ai";

import type { RouterOutputs } from "@acme/api";
import type { UnitCoachIntent, UnitCoachMessage } from "@acme/api/unit-coach";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import type { UnitCoachTrigger } from "~/features/training/lib/unit-coach-commands";
import { AssistantRichText } from "./assistant-rich-text";

type EducationUnit = RouterOutputs["training"]["unit"];

const COACH_COMPOSER_MIN_HEIGHT = 112;
const COACH_COMPOSER_MAX_HEIGHT = 280;

const getCoachComposerBounds = (element: HTMLTextAreaElement | null) => {
  if (typeof window === "undefined") {
    return {
      minHeight: COACH_COMPOSER_MIN_HEIGHT,
      maxHeight: COACH_COMPOSER_MAX_HEIGHT,
    };
  }

  const viewportRatioMax = Math.floor(window.innerHeight * 0.26);
  const viewportCap = Math.min(COACH_COMPOSER_MAX_HEIGHT, viewportRatioMax);
  const availableSpaceFromTop = element
    ? Math.floor(window.innerHeight - element.getBoundingClientRect().top - 52)
    : viewportCap;
  const maxHeight = Math.max(
    COACH_COMPOSER_MIN_HEIGHT,
    Math.min(viewportCap, availableSpaceFromTop),
  );

  return {
    minHeight: COACH_COMPOSER_MIN_HEIGHT,
    maxHeight,
  };
};

const syncCoachComposerHeight = (element: HTMLTextAreaElement | null) => {
  if (!element) return;

  const { minHeight, maxHeight } = getCoachComposerBounds(element);
  element.style.height = "0px";
  const nextHeight = Math.max(
    minHeight,
    Math.min(element.scrollHeight, maxHeight),
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
};

const getMessageText = (message: UnitCoachMessage) =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);

const isTextPart = (value: unknown): value is { type: "text"; text: string } =>
  isRecord(value) && value.type === "text" && typeof value.text === "string";

const getPreviewLearnerMessage = (body: unknown) => {
  if (!isRecord(body)) return "";
  const messages = body.messages;
  if (!isUnknownArray(messages)) return "";

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message) || message.role !== "user") continue;
    const parts = message.parts;
    if (!isUnknownArray(parts)) continue;

    return parts
      .filter(isTextPart)
      .map((part) => part.text)
      .join("")
      .trim();
  }

  return "";
};

const buildPreviewCoachReply = ({
  intent,
  unit,
  learnerMessage,
}: {
  intent: UnitCoachIntent;
  unit: EducationUnit;
  learnerMessage: string;
}) => {
  if (intent === "idk") {
    return `Let’s isolate the blockage in **${unit.title}**. Which part is unclear: **what outcome the scenario wants**, **which signal should drive the decision**, or **how to begin your response**?`;
  }
  if (intent === "explain") {
    return `This scenario is testing whether you can turn the evidence in **${unit.title}** into a concrete decision under pressure. Start by naming the signal that should control the decision; then explain the tradeoff that makes that signal decisive.`;
  }

  return `Your question is: “${learnerMessage}”\n\nAnchor it to the live scenario: identify the decision you are being asked to make, the strongest available signal, and the tradeoff that could invalidate your first instinct.`;
};

const createPreviewCoachFetch =
  (unit: EducationUnit): typeof fetch =>
  (_input, init) => {
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as unknown;
      } catch {
        body = null;
      }
    }

    const intentValue = isRecord(body) ? body.intent : null;
    const intent: UnitCoachIntent =
      intentValue === "idk" ||
      intentValue === "explain" ||
      intentValue === "freeform"
        ? intentValue
        : "freeform";
    const reply = buildPreviewCoachReply({
      intent,
      unit,
      learnerMessage: getPreviewLearnerMessage(body),
    });
    const textPartId = "preview-unit-coach-text";
    const stream = createUIMessageStream<UnitCoachMessage>({
      execute: ({ writer }) => {
        writer.write({ type: "start" });
        writer.write({ type: "text-start", id: textPartId });
        writer.write({ type: "text-delta", id: textPartId, delta: reply });
        writer.write({ type: "text-end", id: textPartId });
        writer.write({ type: "finish", finishReason: "stop" });
      },
    });

    return Promise.resolve(createUIMessageStreamResponse({ stream }));
  };

const prepareUnitCoachRequest = ({
  messages,
  body,
}: {
  messages: UnitCoachMessage[];
  body: Record<string, unknown> | undefined;
}) => ({
  body: {
    ...(body ?? {}),
    messages: messages.slice(-16),
  },
});

export function UnitCoachPanel({
  unit,
  sessionId,
  trigger,
  preview,
  isFocused,
  onClose,
  onToggleFocus,
  onReturnToUnit,
}: {
  unit: EducationUnit;
  sessionId: string;
  trigger: UnitCoachTrigger | null;
  preview: boolean;
  isFocused: boolean;
  onClose: () => void;
  onToggleFocus: () => void;
  onReturnToUnit: () => void;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UnitCoachMessage>({
        api: "/api/training/unit-coach/chat",
        fetch: preview ? createPreviewCoachFetch(unit) : undefined,
        prepareSendMessagesRequest: prepareUnitCoachRequest,
      }),
    [preview, unit],
  );
  const { messages, sendMessage, status } = useChat<UnitCoachMessage>({
    id: `unit-coach-${sessionId}-${unit.nodeId}`,
    transport,
    experimental_throttle: 50,
    onError: () => toast.error("Unit Coach could not respond. Try again."),
  });

  const [question, setQuestion] = useState("");
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const handledNonceRef = useRef<number | null>(null);
  const isRunning = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (
      !trigger ||
      trigger.unitId !== unit.nodeId ||
      handledNonceRef.current === trigger.nonce
    ) {
      return;
    }
    handledNonceRef.current = trigger.nonce;

    void sendMessage(
      { text: `/${trigger.intent}`, metadata: { synthetic: true } },
      { body: { sessionId, intent: trigger.intent } },
    );
  }, [sendMessage, sessionId, trigger, unit.nodeId]);

  useLayoutEffect(() => {
    syncCoachComposerHeight(composerTextareaRef.current);
  }, [question]);

  useEffect(() => {
    const handleResize = () =>
      syncCoachComposerHeight(composerTextareaRef.current);
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
      { body: { sessionId, intent: "freeform" } },
    );
  };

  const visibleMessages = messages.filter(
    (message) => !(message.role === "user" && message.metadata?.synthetic),
  );
  const lastAssistantId = messages.findLast(
    (message) => message.role === "assistant",
  )?.id;

  return (
    <aside className="border-foreground/[0.06] bg-sidebar text-foreground flex h-full min-w-0 flex-col border-l">
      <div className="border-foreground/[0.06] flex h-14 items-center justify-between border-b px-4">
        <div className="min-w-0">
          <div className="text-foreground/80 truncate text-[13px]">
            Unit coach
          </div>
          <div className="text-foreground/34 truncate text-[11px]">
            {unit.title}
          </div>
        </div>
        <div className="flex items-center">
          {isFocused ? (
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
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleFocus}
            className="text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground rounded-none border-0 before:rounded-none"
            aria-label={isFocused ? "Shrink Unit Coach" : "Focus Unit Coach"}
          >
            {isFocused ? <ArrowsIn size={15} /> : <ArrowsOut size={15} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground rounded-none border-0 before:rounded-none"
            aria-label="Close Unit Coach"
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
                content={`Ask about "${unit.title}" and Unit Coach will stay anchored to the live scenario without giving away the answer. If you are stuck, type **/idk** in the workspace.`}
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

      <div className="px-4 pt-2 pb-4">
        <div className="border-foreground/[0.08] bg-card focus-within:border-foreground/18 relative rounded-[10px] border shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_18px_-12px_rgba(0,0,0,0.14)] transition-[border-color,box-shadow] duration-150">
          <textarea
            ref={composerTextareaRef}
            aria-label="Ask Unit Coach"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onInput={(event) => syncCoachComposerHeight(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleAsk();
              }
            }}
            placeholder="Ask what the scenario is testing, how to start, or where your reasoning is stuck."
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
            aria-label="Send to Unit Coach"
          >
            <ArrowUp size={13} weight="bold" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
