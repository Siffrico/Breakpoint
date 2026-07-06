"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";

import { AssistantRichText } from "./assistant-rich-text";

interface ChatHistoryMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  sequence: number;
}

/**
 * Read-only transcript of a past chat (one unit's slice of the workspace
 * conversation). Rendering-only: no composer, no turn state — the live
 * conversation stays on the plain workspace URL.
 */
export function ChatHistoryView({
  messages,
  currentChatHref,
}: {
  messages: ChatHistoryMessage[];
  currentChatHref: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col pb-10">
      <div className="border-foreground/[0.08] bg-foreground/[0.025] mt-4 mb-6 flex items-center justify-between gap-3 rounded-[8px] border px-4 py-2.5">
        <p className="text-foreground/56 min-w-0 truncate text-[12px]">
          You are viewing an earlier chat. It is read-only.
        </p>
        <Link
          href={currentChatHref}
          className="text-foreground/72 hover:text-foreground flex shrink-0 items-center gap-1.5 text-[12px] font-medium transition-colors"
        >
          <ArrowLeft size={13} />
          Back to current chat
        </Link>
      </div>

      {messages.length === 0 ? (
        <div className="text-foreground/48 py-16 text-center text-[13px]">
          No messages were recorded for this chat.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <div className="bg-foreground/[0.05] text-foreground/88 max-w-[85%] rounded-[10px] px-4 py-2.5 text-[14px] leading-6 whitespace-pre-wrap">
                  {message.content}
                </div>
              </div>
            ) : (
              <div
                key={message.id}
                className="bp-prose text-foreground/84 max-w-none text-[14px] leading-7"
              >
                <AssistantRichText content={message.content} />
              </div>
            ),
          )}
        </div>
      )}

    </div>
  );
}
