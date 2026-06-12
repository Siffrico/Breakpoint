"use client";

import type { ReactNode } from "react";

import { cn } from "@acme/ui";

export type ChatMessageRole = "user" | "assistant" | "system";

export function ChatMessage({
  from,
  className,
  children,
  isStreaming = false,
}: {
  from: ChatMessageRole;
  className?: string;
  children: ReactNode;
  isStreaming?: boolean;
}) {
  const isUser = from === "user";

  return (
    <div
      data-from={from}
      data-streaming={isStreaming ? "" : undefined}
      className={cn(
        // One shared full-width column. Alignment is decided by item placement,
        // not by a different container per role, so the user bubble's right edge
        // lands on exactly the same line as the assistant content's right edge.
        "group/message flex w-full flex-col last:min-h-[40dvh]",
        isUser ? "items-end" : "items-start",
        className,
      )}
    >
      {isUser ? (
        <div
          style={{
            backgroundColor: "#1a1a1a",
            borderColor: "#333333",
            borderRadius: 6,
          }}
          // Width hugs content and scales with the column (never a fixed rem),
          // right-anchored via the parent's items-end.
          className="text-[#eeeeee]/92 w-fit max-w-[min(82%,64ch)] whitespace-pre-wrap border px-3.5 py-2 text-[14px] leading-6"
        >
          {children}
        </div>
      ) : (
        // No box: fills the column edge-to-edge, so left edge = column left and
        // right edge = column right (matching the user bubble's right edge).
        <div className="text-foreground/94 w-full font-sans text-[15px] leading-7">
          {children}
        </div>
      )}
    </div>
  );
}

export function ChatStreamingCaret({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-0.5 inline-block h-[1em] w-[1.5px] translate-y-[2px] animate-pulse bg-current align-baseline",
        className,
      )}
    />
  );
}
