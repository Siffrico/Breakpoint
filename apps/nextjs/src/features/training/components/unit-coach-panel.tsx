"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { ArrowLeft, ArrowsIn, ArrowsOut, X } from "@phosphor-icons/react";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  DefaultChatTransport,
  isTextUIPart,
} from "ai";

import type { RouterOutputs } from "@acme/api";
import type { UnitCoachIntent, UnitCoachMessage } from "@acme/api/unit-coach";
import { Button } from "@acme/ui/button";
import {
  ChatComposer,
  ChatMessage,
  ComposerSendButton,
  TextShimmer,
} from "@acme/ui/chat";
import { toast } from "@acme/ui/toast";

import type { UnitCoachTrigger } from "~/features/training/lib/unit-coach-commands";
import { AssistantRichText } from "./assistant-rich-text";

type EducationUnit = RouterOutputs["training"]["unit"];

const getMessageText = (message: UnitCoachMessage) =>
  message.parts.reduce(
    (text, part) => (isTextUIPart(part) ? text + part.text : text),
    "",
  );

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

    let learnerText = "";
    for (const part of parts) {
      if (isTextPart(part)) learnerText += part.text;
    }
    return learnerText.trim();
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

const ASSISTANT_PROSE_CLASS =
  "[&_h2]:mt-0 [&_h2]:!mb-3 [&_h2]:text-[17px] [&_h2]:font-semibold [&_li]:my-1 [&_li]:leading-7 [&_ol]:!my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:!my-3 [&_strong]:font-semibold [&_ul]:!my-3 [&_ul]:list-disc [&_ul]:pl-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

function UnitCoachPanelComponent({
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
  const bottomRef = useRef<HTMLDivElement>(null);
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

    const message =
      trigger.intent === "freeform" ? trigger.message : `/${trigger.intent}`;

    void sendMessage(
      { text: message, metadata: { synthetic: true } },
      { body: { sessionId, intent: trigger.intent } },
    );
  }, [sendMessage, sessionId, trigger, unit.nodeId]);

  const visibleMessages = messages.filter(
    (message) => !(message.role === "user" && message.metadata?.synthetic),
  );
  const lastAssistantId = messages.findLast(
    (message) => message.role === "assistant",
  )?.id;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visibleMessages.length, status]);

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

  // Narrow rail reads edge-to-edge; focused view centers a readable column so it
  // mirrors the main workspace transcript.
  const columnClass = isFocused
    ? "mx-auto w-[calc(100%-2.5rem)] max-w-[44rem]"
    : "w-full px-4";

  return (
    <aside className="border-foreground/[0.06] bg-secondary text-foreground flex h-full min-w-0 flex-col border-l">
      <header className="border-foreground/[0.06] flex h-11 shrink-0 items-center justify-between border-b px-3">
        <div className="min-w-0">
          <div className="text-foreground/80 truncate text-[13px] font-medium">
            Unit coach
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {isFocused ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReturnToUnit}
              className="text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground mr-1 rounded-[6px] border-0 px-2 text-[12px] before:rounded-none"
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
            className="text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground rounded-[6px] border-0 before:rounded-none"
            aria-label={isFocused ? "Shrink Unit Coach" : "Focus Unit Coach"}
          >
            {isFocused ? <ArrowsIn size={15} /> : <ArrowsOut size={15} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground rounded-[6px] border-0 before:rounded-none"
            aria-label="Close Unit Coach"
          >
            <X size={15} />
          </Button>
        </div>
      </header>

      <div className="bg-background flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto py-6">
          <div className={columnClass}>
            {visibleMessages.length === 0 ? (
              <ChatMessage from="assistant">
                <div className="text-foreground/55 text-[14px] leading-7">
                  <AssistantRichText
                    content={`Ask about **${unit.title}** and I’ll stay anchored to the live scenario without giving away the answer. If you’re stuck, type **/idk** in the workspace.`}
                  />
                </div>
              </ChatMessage>
            ) : (
              <div className="flex flex-col gap-7">
                {visibleMessages.map((message) => {
                  const content = getMessageText(message);
                  if (message.role === "assistant") {
                    const isLive = isRunning && message.id === lastAssistantId;
                    return (
                      <ChatMessage key={message.id} from="assistant">
                        {content.trim() ? (
                          <AssistantRichText
                            content={content}
                            className={ASSISTANT_PROSE_CLASS}
                            streaming={isLive}
                          />
                        ) : isLive ? (
                          <TextShimmer
                            text="Thinking…"
                            className="text-foreground/45 text-[14px]"
                          />
                        ) : null}
                      </ChatMessage>
                    );
                  }

                  return (
                    <ChatMessage key={message.id} from="user">
                      {content}
                    </ChatMessage>
                  );
                })}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-foreground/[0.06] shrink-0 border-t pt-2 pb-4">
          <div className={columnClass}>
            <ChatComposer
              compact
              minHeightPx={56}
              maxHeightPx={56}
              value={question}
              onValueChange={setQuestion}
              textareaRef={composerTextareaRef}
              ariaLabel="Ask Unit Coach"
              placeholder="Ask what the scenario is testing, how to start, or where your reasoning is stuck."
              style={{ borderRadius: 0, boxShadow: "none" }}
              className="border-0 bg-transparent"
              // Ask-coach is the only composer that sends on Enter; everywhere
              // else Enter stays a newline in a drafting surface.
              onEnterSubmit={handleAsk}
              rightSlot={
                <ComposerSendButton
                  className="size-7"
                  disabled={!canSubmit}
                  onSubmit={handleAsk}
                  sendLabel="Send to Unit Coach"
                />
              }
            />
          </div>
        </div>
      </div>
    </aside>
  );
}

export const UnitCoachPanel = memo(UnitCoachPanelComponent);
