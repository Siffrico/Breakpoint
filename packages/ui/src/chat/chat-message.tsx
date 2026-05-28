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
        "group/message flex w-full last:min-h-[40dvh]",
        isUser ? "justify-end" : "justify-start",
        className,
      )}
    >
      {isUser ? (
        <div className="bg-secondary/70 text-foreground max-w-[78%] rounded-2xl rounded-br-md border border-border/60 px-4 py-2.5 text-[14.5px] leading-7 whitespace-pre-wrap tracking-[-0.005em] shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          {children}
        </div>
      ) : (
        <div className="text-foreground/92 w-full max-w-[68ch] text-[15px] leading-7 tracking-[-0.005em]">
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
