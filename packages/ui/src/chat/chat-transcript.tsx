"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ArrowDown } from "@phosphor-icons/react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

import { cn } from "@acme/ui";

export function ChatTranscript({
  className,
  children,
  initial = "smooth",
  resize = "smooth",
}: {
  className?: string;
  children: ReactNode;
  initial?: ScrollBehavior | boolean;
  resize?: ScrollBehavior;
}) {
  return (
    <StickToBottom
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
      initial={initial}
      resize={resize}
    >
      {children}
    </StickToBottom>
  );
}

export function ChatTranscriptContent({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <StickToBottom.Content
      className={cn(
        "mx-auto flex w-[calc(100%-2rem)] max-w-[48.9rem] flex-col gap-8 pb-10 pt-10 sm:w-[calc(100%-3rem)]",
        className,
      )}
      {...rest}
    >
      {children}
    </StickToBottom.Content>
  );
}

export function ChatScrollToBottom({
  className,
  label = "Jump to latest",
}: {
  className?: string;
  label?: string;
}) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;

  return (
    <button
      type="button"
      onClick={() => void scrollToBottom()}
      aria-label={label}
      className={cn(
        "border-foreground/[0.16] bg-card/90 text-foreground/78 hover:bg-card hover:text-foreground absolute bottom-28 left-1/2 z-10 inline-flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur transition-colors",
        className,
      )}
    >
      <ArrowDown size={13} weight="bold" />
      {label}
    </button>
  );
}
