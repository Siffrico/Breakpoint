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

import { syncComposerHeight } from "./composer-autosize";

// Text-area metrics follow t3code's composer (`min-h-17.5` / `max-h-50`, i.e.
// 70px resting and 200px ceiling). Our control row is overlaid rather than
// stacked, so the container figures add the top padding and the row height on
// top of those: 70 + 16 (`pt-4`) + 40 (`h-10`) and 200 + 16 + 40.
const MIN_HEIGHT_PX = 126;
const MAX_HEIGHT_PX = 256;

// Compact keeps its own proportions: `pt-2` (8) over an `h-7` (28) row.
const COMPACT_MIN_HEIGHT_PX = 56;
const COMPACT_MAX_HEIGHT_PX = 172;

/**
 * Text surface only. By default Enter inserts a newline — sending is not bound
 * to a key, so the send control in `rightSlot` is the single way to submit.
 * Pass `onEnterSubmit` to opt into Enter-to-send (Shift+Enter still newlines).
 */
export function ChatComposer({
  value,
  onValueChange,
  placeholder = "Type your answer…",
  textareaRef,
  className,
  style,
  leftSlot,
  rightSlot,
  hint,
  autoFocus = false,
  ariaLabel = "Message",
  compact = false,
  minHeightPx: minHeightOverride,
  maxHeightPx: maxHeightOverride,
  onEnterSubmit,
}: {
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
  style?: CSSProperties;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  hint?: ReactNode;
  autoFocus?: boolean;
  ariaLabel?: string;
  compact?: boolean;
  /** Resting height of the text area, before it grows with content. */
  minHeightPx?: number;
  /** Height at which growth stops and the text area starts scrolling. */
  maxHeightPx?: number;
  /**
   * Opt into Enter-to-send. When set, a bare Enter (no Shift, not mid-IME
   * composition) submits; Shift+Enter still inserts a newline. Omit it to keep
   * the default "Enter = newline" surface.
   */
  onEnterSubmit?: () => void;
}) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? internalRef;
  const minHeightPx =
    minHeightOverride ?? (compact ? COMPACT_MIN_HEIGHT_PX : MIN_HEIGHT_PX);
  const maxHeightPx =
    maxHeightOverride ?? (compact ? COMPACT_MAX_HEIGHT_PX : MAX_HEIGHT_PX);

  useLayoutEffect(() => {
    syncComposerHeight(ref.current, minHeightPx, maxHeightPx);
  }, [ref, value, minHeightPx, maxHeightPx]);

  useEffect(() => {
    const handle = () =>
      syncComposerHeight(ref.current, minHeightPx, maxHeightPx);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [ref, minHeightPx, maxHeightPx]);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
    }
  }, [autoFocus, ref]);

  const propagateValue = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange(event.target.value);
  };

  const handleKeyDown = onEnterSubmit
    ? (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          onEnterSubmit();
        }
      }
    : undefined;

  return (
    <div
      style={{
        borderRadius: 32,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
        minHeight: minHeightPx,
        ...style,
      }}
      className={cn(
        "bg-background border-border relative w-full overflow-hidden border transition-[border-color,box-shadow]",
        className,
      )}
    >
      <textarea
        ref={ref}
        aria-label={ariaLabel}
        value={value}
        onChange={propagateValue}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        style={
          compact
            ? { paddingBottom: 28, scrollPaddingBottom: 28 }
            : { paddingBottom: 40, scrollPaddingBottom: 40 }
        }
        className={cn(
          "text-foreground placeholder:text-muted-foreground block w-full resize-none rounded-[inherit] bg-transparent outline-none [&::-webkit-resizer]:hidden",
          compact
            ? "px-3 pt-2 text-[13px] leading-5"
            : "px-4 pt-4 text-[14px] leading-6",
        )}
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center justify-between gap-3",
          compact ? "h-7 px-2" : "h-10 px-3",
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
      {/* max-w-3xl (48rem) matches t3code's composer column. */}
      <div className="mx-auto w-[calc(100%-2rem)] max-w-3xl sm:w-[calc(100%-3rem)]">
        {children}
      </div>
    </div>
  );
}
