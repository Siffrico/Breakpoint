"use client";

import type { ChangeEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "@acme/ui";

const MIN_HEIGHT_PX = 94;
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
      style={{
        backgroundColor: "#111111",
        borderColor: "#2b2b2b",
        borderRadius: 8,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
      }}
      className={cn(
        "relative min-h-[96px] w-full overflow-hidden border transition-[border-color,box-shadow]",
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
        style={{ paddingBottom: 56, scrollPaddingBottom: 56 }}
        className="block w-full resize-none rounded-[8px] bg-transparent px-4 pt-4 text-[14px] leading-6 text-[#eeeeee] outline-none placeholder:text-[#9a9a9a]"
      />

      <div className="absolute inset-x-0 bottom-0 flex h-12 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2 leading-none">
          {leftSlot}
          {hint ? (
            <div className="truncate text-[11px] text-[#8a8a8a]">
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
        "bg-background sticky bottom-0 z-10 w-full pb-3 pt-2",
        className,
      )}
    >
      <div className="mx-auto w-[calc(100%-2rem)] max-w-[48.9rem] sm:w-[calc(100%-3rem)]">
        {children}
      </div>
    </div>
  );
}
