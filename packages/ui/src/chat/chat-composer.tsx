"use client";

import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "@acme/ui";

const MIN_HEIGHT_PX = 94;
const COMPACT_MIN_HEIGHT_PX = 56;
const HARD_MAX_HEIGHT_PX = 240;
const VIEWPORT_RATIO_CAP = 0.24;

function syncHeight(element: HTMLTextAreaElement | null, minHeightPx: number) {
  if (!element) return;

  const viewportCap =
    typeof window === "undefined"
      ? HARD_MAX_HEIGHT_PX
      : Math.min(
          HARD_MAX_HEIGHT_PX,
          Math.floor(window.innerHeight * VIEWPORT_RATIO_CAP),
        );
  const maxHeight = Math.max(minHeightPx, viewportCap);

  element.style.height = "0px";
  const nextHeight = Math.max(
    minHeightPx,
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
  style,
  leftSlot,
  rightSlot,
  hint,
  autoFocus = false,
  ariaLabel = "Message",
  compact = false,
}: {
  value: string;
  onValueChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
  style?: CSSProperties;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  hint?: ReactNode;
  autoFocus?: boolean;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? internalRef;
  const minHeightPx = compact ? COMPACT_MIN_HEIGHT_PX : MIN_HEIGHT_PX;

  useLayoutEffect(() => {
    syncHeight(ref.current, minHeightPx);
  }, [ref, value, minHeightPx]);

  useEffect(() => {
    const handle = () => syncHeight(ref.current, minHeightPx);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [ref, minHeightPx]);

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
        borderRadius: 8,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
        ...style,
      }}
      className={cn(
        "bg-background border-border relative w-full overflow-hidden border transition-[border-color,box-shadow]",
        compact ? "min-h-[56px]" : "min-h-[96px]",
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
        style={
          compact
            ? { paddingBottom: 28, scrollPaddingBottom: 28 }
            : { paddingBottom: 56, scrollPaddingBottom: 56 }
        }
        className={cn(
          "text-foreground placeholder:text-muted-foreground block w-full resize-none rounded-[8px] bg-transparent outline-none [&::-webkit-resizer]:hidden",
          compact
            ? "px-3 pt-2 text-[13px] leading-5"
            : "px-4 pt-4 text-[14px] leading-6",
        )}
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center justify-between gap-3",
          compact ? "h-7 px-2" : "h-12 px-3",
        )}
      >
        <div className="flex min-w-0 items-center gap-2 leading-none">
          {leftSlot}
          {hint ? (
            <div className="text-muted-foreground truncate text-[11px]">
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
