"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";

import { toCompletedExchanges } from "./education-unit/exchange-grouping";
import { ExchangeReceipt } from "./education-unit/exchange-receipt";

interface ChatHistoryMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  sequence: number;
}

/**
 * Read-only transcript of a past chat (one unit's slice of the workspace
 * conversation), rendered as the same collapsed exchange receipts the live
 * workspace uses — every exchange starts collapsed and expands in place.
 * Rendering-only: no composer, no turn state.
 */
export function ChatHistoryView({
  messages,
  currentChatHref,
  onBackToCurrentChat,
}: {
  messages: ChatHistoryMessage[];
  currentChatHref: string;
  onBackToCurrentChat?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const exchanges = toCompletedExchanges(
    messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.content,
    })),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col pb-10">
      <div className="border-foreground/[0.08] bg-foreground/[0.025] mt-4 mb-6 flex items-center justify-between gap-3 rounded-md border px-4 py-2.5">
        <p className="text-foreground/56 min-w-0 truncate text-[12px]">
          You are viewing an earlier chat. It is read-only.
        </p>
        <Link
          href={currentChatHref}
          onClick={onBackToCurrentChat}
          className="text-foreground/72 hover:text-foreground flex shrink-0 items-center gap-1.5 text-[12px] font-medium transition-colors"
        >
          <ArrowLeft size={13} />
          Back to current chat
        </Link>
      </div>

      {exchanges.length === 0 ? (
        <div className="text-foreground/48 py-16 text-center text-[13px]">
          No messages were recorded for this chat.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 font-sans">
          {exchanges.map((exchange, index) => (
            <ExchangeReceipt
              key={
                exchange.prompt?.id ??
                exchange.answer?.id ??
                `exchange-${index}`
              }
              exchange={exchange}
              fallbackTitle={`Exchange ${index + 1}`}
              readOnly
            />
          ))}
        </div>
      )}
    </div>
  );
}
