"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ArrowDown } from "@phosphor-icons/react";
import {
  StickToBottom,
  useStickToBottomContext,
} from "use-stick-to-bottom";

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
        "mx-auto flex w-full max-w-[48rem] flex-col gap-8 px-5 pt-10 pb-8 sm:px-8",
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
        "absolute bottom-4 left-1/2 z-10 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 text-[12px] font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-card",
        className,
      )}
    >
      <ArrowDown size={13} weight="bold" />
      {label}
    </button>
  );
}
