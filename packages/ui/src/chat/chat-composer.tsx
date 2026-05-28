"use client";

import type {
  ChangeEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "@acme/ui";

const MIN_HEIGHT_PX = 56;
const HARD_MAX_HEIGHT_PX = 240;
const VIEWPORT_RATIO_CAP = 0.24;

function syncHeight(element: HTMLTextAreaElement | null) {
  if (!element) return;

  const viewportCap =
    typeof window === "undefined"
      ? HARD_MAX_HEIGHT_PX
      : Math.min(
          HARD_MAX_HEIGHT_PX,
          Math.floor(window.innerHeight * VIEWPORT_RATIO_CAP),
        );
  const maxHeight = Math.max(MIN_HEIGHT_PX, viewportCap);

  element.style.height = "0px";
  const nextHeight = Math.max(
    MIN_HEIGHT_PX,
    Math.min(element.scrollHeight, maxHeight),
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
}

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder = "Type your answer…",
  disabled = false,
  textareaRef,
  className,
  leftSlot,
  rightSlot,
  hint,
  autoFocus = false,
  ariaLabel = "Message",
}: {
  value: string;
  onValueChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  hint?: ReactNode;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? internalRef;

  useLayoutEffect(() => {
    syncHeight(ref.current);
  }, [ref, value]);

  useEffect(() => {
    const handle = () => syncHeight(ref.current);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [ref]);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
    }
  }, [autoFocus, ref]);

  const propagateValue = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange(event.target.value);
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  return (
    <div
      className={cn(
        "border-border bg-card/95 focus-within:border-foreground/24 relative w-full rounded-2xl border shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_28px_-18px_rgba(0,0,0,0.18)] backdrop-blur transition-[border-color,box-shadow]",
        className,
      )}
    >
      <textarea
        ref={ref}
        aria-label={ariaLabel}
        value={value}
        onChange={propagateValue}
        onKeyDown={submitOnEnter}
        placeholder={placeholder}
        rows={1}
        className="text-foreground placeholder:text-foreground/35 block w-full resize-none rounded-2xl bg-transparent px-4 pt-3.5 pb-12 text-[14.5px] leading-7 tracking-[-0.005em] outline-none"
      />

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-3 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {leftSlot}
          {hint ? (
            <div className="text-foreground/35 truncate text-[11px]">
              {hint}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">{rightSlot}</div>
      </div>
    </div>
  );
}

export function ChatComposerDock({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-background/95 sticky bottom-0 z-10 w-full pt-2 pb-4 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[48rem] px-5 sm:px-8">
        {children}
      </div>
    </div>
  );
}
